'use strict';

const express = require('express');
const crypto = require('node:crypto');
const { TYPES, READ_MODEL_SQL, parseFilters, filterClause, decorateOrder, csvCell } = require('../lib/order-center');
const {changeRemoval,getSettings,settingsInput,candidates,createCleanupService}=require('../lib/order-cleanup');

const SOURCES = {
  boost: ['order','orders','order_no'], rental: ['rental_order','rental_orders','order_no'],
  recharge: ['payment_order','payment_orders','out_trade_no'], shop: ['shop_purchase','qy_purchases','id'],
  third_party: ['third_party_order','third_party_orders','order_no']
};

function sourceRef(type, ref) {
  return type === 'shop' ? ref.replace(/^SHOP/, '') : ref;
}

function createOrderCenterRouter({ pool, authMiddleware, recordOperation, revealOrderCredentials, cleanupService }) {
  const router = express.Router();
  router.use(authMiddleware);
  router.use(async (req, res, next) => {
    try {
      const [users] = await pool.execute('SELECT role FROM users WHERE id = ?', [req.userId]);
      if (!users.length) return res.status(401).json({ error: '用户不存在' });
      req.orderRole = users[0].role;
      req.orderAdmin = req.query.scope === 'admin';
      if (req.orderAdmin && req.orderRole !== 'admin') return res.status(403).json({ error: '无管理员权限' });
      res.set('Cache-Control', 'no-store');
      next();
    } catch { res.status(503).json({ error: '暂时无法验证订单权限' }); }
  });

  const cleanup=cleanupService || createCleanupService({pool,recordOperation});
  router.get('/cleanup',async(req,res)=>{
    if(req.orderRole!=='admin')return res.status(403).json({error:'无管理员权限'});
    try {const settings=await getSettings(pool);const rows=await candidates(pool,settings.retention_days);
      res.json({settings,candidates:rows.map(r=>({type:r.order_type,ref:r.order_ref,title:r.title,created_at:r.created_at})),limit:200});
    }catch{res.status(500).json({error:'清理规则加载失败'});}
  });
  router.put('/cleanup',async(req,res)=>{
    if(req.orderRole!=='admin')return res.status(403).json({error:'无管理员权限'});
    try {const value=settingsInput(req.body);const conn=await pool.getConnection();
      try {await conn.beginTransaction();await conn.execute(`INSERT INTO order_cleanup_settings (id,enabled,retention_days,updated_by) VALUES (1,?,?,?)
        ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),retention_days=VALUES(retention_days),updated_by=VALUES(updated_by)`,[value.enabled?1:0,value.retention_days,req.userId]);
        await recordOperation(conn,{eventKey:`order_cleanup_settings:${crypto.randomUUID()}`,actorUserId:req.userId,action:'order_cleanup_settings_changed',targetType:'order_cleanup',targetRef:'1'});
        await conn.commit();res.json({success:true});
      }catch(err){await conn.rollback();throw err;}finally{conn.release();}
    }catch(err){res.status(err.status || 500).json({error:err.status?err.message:'清理规则保存失败'});}
  });
  router.post('/cleanup/run',async(req,res)=>{
    if(req.orderRole!=='admin')return res.status(403).json({error:'无管理员权限'});
    if(req.body?.confirmation!=='MOVE_INVALID_ORDERS_TO_TRASH')return res.status(400).json({error:'请先预览并确认清理规则'});
    try {res.json(await cleanup.run(req.userId,true));}catch(err){res.status(err.status || 500).json({error:err.status?err.message:'清理失败，请刷新检查已处理结果'});}
  });
  router.post('/removals',async(req,res)=>{
    if(req.orderRole!=='admin')return res.status(403).json({error:'无管理员权限'});
    const {orders,reason,action}=req.body || {};
    if(!Array.isArray(orders)||orders.length<1||orders.length>25||!['remove','restore'].includes(action)||typeof reason!=='string'||!reason.trim()||reason.trim().length>500)
      return res.status(400).json({error:'请选择1–25个订单并填写操作原因'});
    if(orders.some(o=>!o||!TYPES.includes(o.type)||typeof o.ref!=='string'||!o.ref||o.ref.length>64)||new Set(orders.map(o=>o.type+':'+o.ref)).size!==orders.length)
      return res.status(400).json({error:'订单列表无效或重复'});
    const results=[];
    for(const order of orders) {try {results.push(await changeRemoval({pool,recordOperation,...order,actor:req.userId,reason,restore:action==='restore'}));}
      catch(err){results.push({...order,success:false,error:err.status?err.message:'处理失败，请刷新重试'});}}
    res.json({results,success_count:results.filter(r=>r.success).length});
  });

  async function findOrder(req, ref = req.params.ref, type = req.params.type, conn = pool) {
    if (!TYPES.includes(type) || !ref || ref.length > 64) return null;
    const conditions = ['c.order_type=?','c.order_ref=?']; const params = [type, ref];
    if (req.orderRole !== 'admin') {
      conditions.push('(c.customer_id=? OR c.related_user_id=?)'); params.push(req.userId, req.userId);
      if (type === 'third_party' && req.orderRole !== 'booster') return null;
    }
    const [rows] = await conn.execute(READ_MODEL_SQL + ' WHERE ' + conditions.join(' AND '), params);
    return rows[0] ? decorateOrder(rows[0], req.userId, req.orderRole === 'admin') : null;
  }

  router.get('/export', async (req, res) => {
    if (req.orderRole !== 'admin' || !req.orderAdmin) return res.status(403).json({ error: '无管理员权限' });
    let filters;
    try { filters = parseFilters(req.query); } catch (err) { return res.status(400).json({ error: err.message }); }
    try {
      const where = filterClause(filters, { admin: true, userId: req.userId, role: req.orderRole });
      const [rows] = await pool.execute(READ_MODEL_SQL + where.sql + ' ORDER BY c.created_at DESC,c.order_type,c.order_ref LIMIT 5001', where.params);
      if (rows.length > 5000) return res.status(400).json({ error: '结果超过 5000 条，请缩小日期或类型范围后导出' });
      const lines = [['类型','订单号','用户','摘要','金额','单位','状态','支付渠道','交易号','创建时间'],
        ...rows.map((row) => [row.order_type,row.order_ref,row.customer_name,row.title,row.amount,
          row.amount_unit === 'credits' ? '积分' : '元',decorateOrder(row,req.userId,true).state_label,
          row.payment_channel,row.payment_reference,row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at])];
      res.type('text/csv; charset=utf-8').set('Content-Disposition','attachment; filename="orders.csv"');
      res.send('\uFEFF' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n'));
    } catch { res.status(500).json({ error: '订单导出失败' }); }
  });

  router.get('/', async (req, res) => {
    let filters;
    try { filters = parseFilters(req.query); } catch (err) { return res.status(400).json({ error: err.message }); }
    try {
      const options = { admin: req.orderAdmin, userId: req.userId, role: req.orderRole };
      const where = filterClause(filters, options);
      const summaryWhere = filterClause(filters, { ...options, includeState: false });
      const [rows] = await pool.execute(READ_MODEL_SQL + where.sql +
        ` ORDER BY c.created_at DESC,c.order_type,c.order_ref LIMIT 25 OFFSET ${(filters.page - 1) * 25}`, where.params);
      const [total] = await pool.execute(`SELECT COUNT(*) AS total FROM (${READ_MODEL_SQL + where.sql}) result`, where.params);
      const [summary] = await pool.execute(`SELECT state, admin_task, COUNT(*) AS total FROM
        (${READ_MODEL_SQL + summaryWhere.sql}) result GROUP BY state,admin_task`, summaryWhere.params);
      res.json({ orders: rows.map((row) => decorateOrder(row,req.userId,req.orderAdmin)),
        total: Number(total[0].total), page: filters.page, page_size: 25, summary });
    } catch (err) {
      console.error('订单中心列表失败:', err.code || 'INTERNAL_ERROR');
      res.status(500).json({ error: '订单列表暂时无法加载' });
    }
  });

  router.get('/:type/:ref', async (req, res) => {
    try {
      const order = await findOrder(req);
      if (!order) return res.status(404).json({ error: '订单不存在或无权查看' });
      const type = order.order_type; const ref = sourceRef(type, order.order_ref);
      const [sourceType, table, column] = SOURCES[type];
      const [source] = await pool.execute(`SELECT * FROM ${table} WHERE ${column}=?`, [ref]);
      let raw = source[0];
      const details = [];
      const add = (label, value) => details.push({ label, value: value ?? '—' });
      let screenshot = null;
      let warning = null;
      if (type === 'recharge') {
        const [workflows] = await pool.execute('SELECT * FROM recharge_order_workflow WHERE out_trade_no=?', [ref]);
        const w = workflows[0] || {};
        add('购买数量', w.ticket_quantity ? `${w.ticket_quantity} 军需券` : '历史订单：6 元兑换 10000 券');
        add('支付时间', raw.paid_at); add('到账时间', order.credited_at);
        add('支付宝交易号', raw.alipay_trade_no); add('最近支付查询', w.provider_checked_at);
        add('支付平台状态', w.provider_status); add('关闭时间', raw.closed_at);
        if (order.state === 'credit_pending') warning = '已核实支付成功，到账事务尚未完成。请刷新状态或由管理员重试到账，无需再次付款。';
        if (order.state === 'exception') warning = raw.status === 'paid'
          ? '历史已支付订单缺少对应到账流水，需人工核对。系统不会重复发放军需券。'
          : '支付平台和本地订单状态不一致，需人工核对。请勿再次付款。';
      } else if (type === 'boost') {
        if(order.state==='exception') warning='订单执行状态与收款状态不一致，请联系管理员核对历史收款和完单记录。';
        raw = revealOrderCredentials(raw, { includePassword: req.orderRole === 'admin' || Number(raw.user_id) === Number(req.userId) });
        for (const [label,key] of [['数量','quantity'],['客户端','client_type'],['服务方案','player_name'],['备注','remark'],['接单状态','hall_status'],['游戏 UID','game_uid'],['游戏账号','game_account'],['游戏密码','game_password']]) add(label,raw[key]);
        screenshot = raw.payment_screenshot;
      } else if (type === 'rental') {
        const [workflows] = await pool.execute(
          `SELECT w.*,rr.refund_reference,rr.refunded_amount,e.filename
           FROM rental_order_workflow w LEFT JOIN rental_refund_reviews rr ON rr.order_no=w.order_no
           LEFT JOIN manual_payment_evidence e ON e.id=(SELECT MAX(id) FROM manual_payment_evidence
             WHERE business_type='rental_order' AND business_ref=w.order_no) WHERE w.order_no=?`, [ref]);
        const w = workflows[0] || {};
        add('抵扣积分',raw.credits_used); add('出租方',order.assignee_name);
        add('完单申请',w.owner_complete_requested_at); add('租用方确认',w.renter_confirmed_at);
        add('争议发起',w.disputed_at); add('退款交易号',w.refund_reference); add('退款金额',w.refunded_amount);
        screenshot = w.filename;
      } else if (type === 'third_party') {
        const [workflows] = await pool.execute('SELECT * FROM third_party_order_workflow WHERE order_no=?',[ref]);
        const w = workflows[0] || {};
        const { normalizePlatform } = require('../lib/third-party-workflow');
        add('游戏服务器',normalizePlatform(raw.platform)); add('账号信息',raw.account_info);
        add('外部订单号',w.external_order_no); add('预计完成',w.expected_at);
        add('驳回原因',w.rejection_reason); add('完单说明',w.completion_note); add('验收退回原因',w.completion_return_reason);
      } else { add('兑换商品',raw.item_name); add('消耗积分',raw.price_credits); }
      const [ledger] = await pool.execute(
        `SELECT l.account_type,l.amount_delta,l.balance_after,l.created_at,l.entry_key,u.username AS user_name FROM account_ledger l
         JOIN users u ON u.id=l.user_id WHERE l.source_type=? AND l.source_ref=? ${req.orderRole === 'admin' ? '' : 'AND l.user_id=?'} ORDER BY l.id`,
        req.orderRole === 'admin' ? [sourceType,ref] : [sourceType,ref,req.userId]);
      const [events] = await pool.execute(
        `SELECT e.action,e.note,e.created_at,u.username AS actor_name FROM order_management_events e
         LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.order_type=? AND e.order_ref=?
         UNION ALL SELECT a.action,NULL,a.created_at,u.username FROM operation_audit a
         LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.target_type=? AND a.target_ref=?
         ORDER BY created_at ASC`,[type,order.order_ref,sourceType,ref]);
      if (type === 'third_party') {
        const [tpEvents] = await pool.execute(`SELECT e.event_type AS action,e.note,e.created_at,u.username AS actor_name
          FROM third_party_order_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.order_no=?`,[ref]);
        events.push(...tpEvents); events.sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
      }
      if (screenshot && !/^[\w.-]+\.(png|jpe?g)$/i.test(screenshot)) screenshot = null;
      res.json({ order, details, ledger, events, screenshot, warning });
    } catch (err) {
      console.error('订单中心详情失败:', err.code || 'INTERNAL_ERROR');
      res.status(500).json({ error: '订单详情暂时无法加载' });
    }
  });

  router.post('/:type/:ref/archive', async (req, res) => {
    if (req.orderRole !== 'admin') return res.status(403).json({ error: '无管理员权限' });
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length > 500 || !['archive','unarchive'].includes(req.body.action)) return res.status(400).json({ error: '请选择归档操作并填写原因（最多500字）' });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const order = await findOrder(req,req.params.ref,req.params.type,conn);
      if (!order) { await conn.rollback(); return res.status(404).json({ error: '订单不存在' }); }
      if (!['completed','credited','closed'].includes(order.state)) {
        await conn.rollback(); return res.status(409).json({ error: '只有已完成、已到账或已关闭订单可以归档' });
      }
      const archive = req.body.action === 'archive';
      await conn.execute('INSERT IGNORE INTO order_management_state (order_type,order_ref) VALUES (?,?)',[order.order_type,order.order_ref]);
      const [states] = await conn.execute('SELECT archived_at FROM order_management_state WHERE order_type=? AND order_ref=? FOR UPDATE',[order.order_type,order.order_ref]);
      if (Boolean(states[0].archived_at) === archive) { await conn.rollback(); return res.status(409).json({ error: '订单归档状态已变化，请刷新列表' }); }
      await conn.execute(`UPDATE order_management_state SET archived_at=${archive ? 'NOW()' : 'NULL'},archived_by=?,archive_reason=? WHERE order_type=? AND order_ref=?`,
        [req.userId,reason,order.order_type,order.order_ref]);
      await conn.execute('INSERT INTO order_management_events (order_type,order_ref,actor_user_id,action,note) VALUES (?,?,?,?,?)',
        [order.order_type,order.order_ref,req.userId,req.body.action,reason]);
      await recordOperation(conn,{ eventKey: `order_center:${crypto.randomUUID()}`,actorUserId:req.userId,
        action:req.body.action === 'archive' ? 'order_archived' : 'order_unarchived',
        targetType:SOURCES[order.order_type][0],targetRef:sourceRef(order.order_type,order.order_ref) });
      await conn.commit(); res.json({ success:true });
    } catch { await conn.rollback(); res.status(500).json({ error:'归档失败' }); }
    finally { conn.release(); }
  });

  return router;
}

module.exports = { createOrderCenterRouter };
