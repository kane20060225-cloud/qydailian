'use strict';

const express = require('express');

function createRentalAccountRouter({ pool, authMiddleware, adminMiddleware,
  recordOperation, saveRentalScreenshot, maxImageBytes, uploadDir, randomUUID }) {
  const router = express.Router();

  router.post('/rental/upload-screenshot', authMiddleware, async (req, res) => {
    const contentType = req.get('content-type') || '';
    const contentLength = Number(req.get('content-length') || 0);
    if (!contentType.toLowerCase().startsWith('application/json') &&
        contentLength > maxImageBytes) {
      return res.status(413).json({ error: '截图大小不能超过 5MB' });
    }
    try {
      const filename = await saveRentalScreenshot({
        stream: req, body: req.body, contentType, uploadDir, userId: req.userId
      });
      res.json({ success: true, filename });
    } catch (err) {
      const clientError = /^(只接受|请提供|截图|图片格式|用户 ID)/.test(err.message);
      res.status(clientError ? 400 : 500)
        .json({ error: clientError ? err.message : '保存图片失败' });
    }
  });

  router.get('/rental/accounts', async (req, res) => {
    try {
      const [rows] = await pool.execute(
        `SELECT ra.*, CASE WHEN EXISTS (SELECT 1 FROM rental_orders busy WHERE busy.account_id=ra.id AND busy.status='active') THEN 'rented'
          WHEN EXISTS (SELECT 1 FROM rental_orders busy WHERE busy.account_id=ra.id AND busy.status='pending') THEN 'reserved' ELSE 'available' END AS availability_status,
                u.username AS owner_name, u.reputation AS owner_reputation,
                u.booster_identity AS owner_identity
         FROM rental_accounts ra JOIN users u ON ra.owner_id = u.id
         WHERE ra.status = 'active' AND ra.deleted_at IS NULL
         ORDER BY ra.created_at DESC`
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: '服务器错误' });
    }
  });

  router.get('/rental/accounts/:id', async (req, res) => {
    try {
      const [rows] = await pool.execute(
        `SELECT ra.*, CASE WHEN EXISTS (SELECT 1 FROM rental_orders busy WHERE busy.account_id=ra.id AND busy.status='active') THEN 'rented'
          WHEN EXISTS (SELECT 1 FROM rental_orders busy WHERE busy.account_id=ra.id AND busy.status='pending') THEN 'reserved' ELSE 'available' END AS availability_status,
                u.username AS owner_name, u.reputation AS owner_reputation
         FROM rental_accounts ra JOIN users u ON ra.owner_id = u.id
         WHERE ra.id = ? AND ra.status = 'active' AND ra.deleted_at IS NULL`,
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: '账号不存在' });
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: '服务器错误' });
    }
  });

  router.post('/rental/accounts', authMiddleware, async (req, res) => {
    const { game_uid, client_type, tank_list, hourly_price, daily_price,
      available_time_desc, screenshots, rules } = req.body;
    if (!client_type) return res.status(400).json({ error: '请选择客户端类型' });
    if (!hourly_price && !daily_price) return res.status(400).json({ error: '请设置租金' });
    try {
      await pool.execute(
        `INSERT INTO rental_accounts (owner_id, game_uid, client_type, tank_list,
          hourly_price, daily_price, available_time_desc, screenshots, rules, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [req.userId, game_uid || null, client_type, tank_list || null,
          hourly_price || 0, daily_price || 0, available_time_desc || '',
          screenshots ? JSON.stringify(screenshots) : null, rules || '']
      );
      res.status(201).json({ success: true, message: '出租申请已提交，等待管理员审核' });
    } catch (err) {
      res.status(500).json({ error: '服务器错误' });
    }
  });

  router.get('/rental/my-accounts', authMiddleware, async (req, res) => {
    try {
      const deleted = req.query.deleted === '1' ? 'NOT NULL' : 'NULL';
      const [rows] = await pool.execute(
        `SELECT * FROM rental_accounts WHERE owner_id = ? AND deleted_at IS ${deleted}
         ORDER BY created_at DESC, id DESC`, [req.userId]
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: '服务器错误' });
    }
  });

  router.put('/rental/accounts/:id/status', authMiddleware, async (req, res) => {
    const status = req.body?.status;
    const accountId = Number(req.params.id);
    if (!Number.isSafeInteger(accountId) || accountId <= 0 ||
        !['pending', 'suspended'].includes(status)) {
      return res.status(400).json({ error: '只能下架或申请重新审核，不能自行上架' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [accounts] = await conn.execute(
        `SELECT id, status, deleted_at FROM rental_accounts
         WHERE id = ? AND owner_id = ? FOR UPDATE`, [accountId, req.userId]
      );
      if (!accounts.length) {
        await conn.rollback();
        return res.status(404).json({ error: '账号不存在或无权操作' });
      }
      const previous = accounts[0].status;
      if (accounts[0].deleted_at) {
        await conn.rollback();
        return res.status(409).json({ error: '已删除账号须先恢复并重新审核' });
      }
      if ((status === 'suspended' && previous !== 'active') ||
          (status === 'pending' && previous !== 'suspended')) {
        await conn.rollback();
        return res.status(409).json({ error: '账号状态已变化，请刷新后重试' });
      }
      const [result] = await conn.execute(
        `UPDATE rental_accounts SET status = ?
         WHERE id = ? AND owner_id = ? AND status = ? AND deleted_at IS NULL`,
        [status, accountId, req.userId, previous]
      );
      if (result.affectedRows !== 1) throw new Error('账号状态已变化');
      await recordOperation(conn, {
        eventKey: `rental_account:${accountId}:${randomUUID()}`,
        actorUserId: req.userId,
        action: status === 'pending' ? 'rental_account_rereview_requested' :
          'rental_account_suspended_by_owner',
        targetType: 'rental_account', targetRef: String(accountId)
      });
      await conn.commit();
      res.json({ success: true, status });
    } catch (err) {
      await conn.rollback();
      res.status(500).json({ error: '服务器错误' });
    } finally { conn.release(); }
  });

  router.put('/admin/rental/accounts/:id/review', adminMiddleware, async (req, res) => {
    const approved = req.body?.approved;
    const accountId = Number(req.params.id);
    if (typeof approved !== 'boolean' || !Number.isSafeInteger(accountId) || accountId <= 0) {
      return res.status(400).json({ error: '审核参数无效' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [accounts] = await conn.execute(
        'SELECT id, status, deleted_at FROM rental_accounts WHERE id = ? FOR UPDATE',
        [accountId]
      );
      if (!accounts.length) {
        await conn.rollback();
        return res.status(404).json({ error: '出租账号不存在' });
      }
      const previous = accounts[0].status;
      if (accounts[0].deleted_at) {
        await conn.rollback();
        return res.status(409).json({ error: '已删除账号须先恢复，不能直接审核' });
      }
      if ((approved && !['pending', 'suspended'].includes(previous)) ||
          (!approved && !['pending', 'active'].includes(previous))) {
        await conn.rollback();
        return res.status(409).json({ error: '账号状态已变化，请刷新后重试' });
      }
      const newStatus = approved ? 'active' : 'suspended';
      const [result] = await conn.execute(
        `UPDATE rental_accounts SET status = ?
         WHERE id = ? AND status = ? AND deleted_at IS NULL`,
        [newStatus, accountId, previous]
      );
      if (result.affectedRows !== 1) throw new Error('账号状态已变化');
      await recordOperation(conn, {
        eventKey: `rental_account:${accountId}:${randomUUID()}`,
        actorUserId: req.userId,
        action: approved ? 'rental_account_approved' :
          previous === 'pending' ? 'rental_account_rejected' :
            'rental_account_suspended_by_admin',
        targetType: 'rental_account', targetRef: String(accountId)
      });
      await conn.commit();
      res.json({ success: true, status: newStatus,
        message: approved ? '审核通过，已上架' : '已拒绝或下架' });
    } catch (err) {
      await conn.rollback();
      res.status(500).json({ error: '服务器错误' });
    } finally { conn.release(); }
  });

  async function changeArchive(req, res, { restore, admin }) {
    const accountId = Number(req.params.id);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) {
      return res.status(400).json({ error: '出租账号 ID 无效' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [accounts] = await conn.execute(
        admin ? 'SELECT id, deleted_at FROM rental_accounts WHERE id = ? FOR UPDATE' :
          'SELECT id, deleted_at FROM rental_accounts WHERE id = ? AND owner_id = ? FOR UPDATE',
        admin ? [accountId] : [accountId, req.userId]
      );
      if (!accounts.length) {
        await conn.rollback();
        return res.status(404).json({ error: '账号不存在或无权操作' });
      }
      if (restore ? !accounts[0].deleted_at : !!accounts[0].deleted_at) {
        await conn.rollback();
        return res.status(409).json({ error: '账号状态已变化，请刷新后重试' });
      }
      if (!restore) {
        const [occupied] = await conn.execute(
          'SELECT id FROM rental_orders WHERE account_id = ? AND status IN (?, ?) LIMIT 1',
          [accountId, 'pending', 'active']
        );
        if (occupied.length) {
          await conn.rollback();
          return res.status(409).json({ error: '账号有进行中租单，须先完成或取消后再删除' });
        }
      }
      const [result] = await conn.execute(
        restore ? `UPDATE rental_accounts SET deleted_at = NULL, status = 'pending'
                   WHERE id = ? AND deleted_at IS NOT NULL` :
          `UPDATE rental_accounts SET deleted_at = UTC_TIMESTAMP(), status = 'suspended'
           WHERE id = ? AND deleted_at IS NULL`, [accountId]
      );
      if (result.affectedRows !== 1) throw new Error('账号状态已变化');
      await recordOperation(conn, {
        eventKey: `rental_account:${accountId}:${randomUUID()}`,
        actorUserId: req.userId,
        action: restore ? 'rental_account_restored_for_review' :
          admin ? 'rental_account_archived_by_admin' : 'rental_account_archived_by_owner',
        targetType: 'rental_account', targetRef: String(accountId)
      });
      await conn.commit();
      res.json({ success: true, status: restore ? 'pending' : 'deleted',
        message: restore ? '已恢复为待审核，请等待管理员处理' :
          '已删除展示，历史租单仍保留' });
    } catch (err) {
      await conn.rollback();
      res.status(500).json({ error: '服务器错误' });
    } finally { conn.release(); }
  }

  router.post('/rental/accounts/:id/archive', authMiddleware, (req, res) =>
    changeArchive(req, res, { restore: false, admin: false }));
  router.post('/rental/accounts/:id/restore', authMiddleware, (req, res) =>
    changeArchive(req, res, { restore: true, admin: false }));
  router.post('/admin/rental/accounts/:id/archive', adminMiddleware, (req, res) =>
    changeArchive(req, res, { restore: false, admin: true }));
  router.post('/admin/rental/accounts/:id/restore', adminMiddleware, (req, res) =>
    changeArchive(req, res, { restore: true, admin: true }));

  router.get('/admin/rental/accounts', adminMiddleware, async (req, res) => {
    const status = req.query.status || '';
    const page = Number(req.query.page || 1);
    if (status && !['pending', 'active', 'suspended', 'deleted'].includes(status)) {
      return res.status(400).json({ error: '筛选状态无效' });
    }
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
      return res.status(400).json({ error: '页码无效' });
    }
    try {
      const where = status === 'deleted' ? 'WHERE ra.deleted_at IS NOT NULL' :
        status ? 'WHERE ra.deleted_at IS NULL AND ra.status = ?' :
          'WHERE ra.deleted_at IS NULL';
      const filters = status && status !== 'deleted' ? [status] : [];
      const [counts] = await pool.execute(
        `SELECT COUNT(*) AS total FROM rental_accounts ra ${where}`, filters
      );
      const [rows] = await pool.query(
        `SELECT ra.id, ra.owner_id, ra.game_uid, ra.client_type,
                ra.tank_list, ra.hourly_price, ra.daily_price,
                ra.available_time_desc, ra.screenshots, ra.rules,
                ra.status, ra.deleted_at, ra.created_at, u.username AS owner_name
         FROM rental_accounts ra JOIN users u ON ra.owner_id = u.id
         ${where} ORDER BY ra.created_at DESC, ra.id DESC LIMIT ? OFFSET ?`,
        [...filters, 25, (page - 1) * 25]
      );
      res.set('X-Total-Count', String(counts[0].total));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: '服务器错误' });
    }
  });

  return router;
}

module.exports = { createRentalAccountRouter };
