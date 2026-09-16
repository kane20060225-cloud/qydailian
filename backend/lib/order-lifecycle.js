'use strict';

const { postAccountDelta } = require('./accounting');
const crypto = require('node:crypto');
const { queryAlipayTrade, amountToCents, ALIPAY_SUCCESS_STATUSES } = require('./payment-security');
const SOURCES = { boost: ['orders', 'order', 'user_id'], rental: ['rental_orders', 'rental_order', 'renter_id'] };
const TIMEOUT_HOURS = 24;
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };

function reasonInput(reason) {
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) fail('请填写处理原因（最多500字）', 400);
  return reason.trim();
}

async function event(conn, recordOperation, type, ref, actor, action, reason) {
  await conn.execute('INSERT INTO order_management_events (order_type,order_ref,actor_user_id,action,note) VALUES (?,?,?,?,?)',
    [type, ref, actor, action, reason]);
  await recordOperation(conn, { eventKey: `lifecycle:${crypto.randomUUID()}`, actorUserId: actor,
    action, targetType: type === 'recharge' ? 'payment_order' : SOURCES[type][1], targetRef: ref });
}

async function cancelUnpaid({ pool, recordOperation, type, ref, actor, admin = false, reason, timeout = false }) {
  if (!SOURCES[type] || typeof ref !== 'string' || !ref || ref.length > 64) fail('无效订单', 400);
  reason = reasonInput(reason);
  const [table, sourceType, ownerColumn] = SOURCES[type];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(`SELECT *,created_at<=DATE_SUB(NOW(),INTERVAL 24 HOUR) AS expired FROM ${table} WHERE order_no=? FOR UPDATE`, [ref]);
    const order = rows[0];
    if (!order || (!admin && Number(order[ownerColumn]) !== Number(actor))) fail('订单不存在或无权操作', 404);
    if (order.status === 'cancelled') { await conn.commit(); return { success: true, already_closed: true }; }
    if (order.status !== 'pending') fail('只有未执行的待付款订单可以取消');
    const [removed]=await conn.execute('SELECT order_ref FROM order_removals WHERE order_type=? AND order_ref=?',[type,ref]);
    if(removed.length)fail('订单已移入回收站，请先恢复后再取消');
    if (timeout && !order.expired) fail('订单尚未超过24小时');
    if (type === 'boost' && (order.payment_status !== 'unpaid' || order.booster_id || order.hall_status || order.payment_screenshot))
      fail('订单已有付款审核、凭证或接单记录，不能按未付款取消');
    if (type === 'rental') {
      const [workflows] = await conn.execute('SELECT * FROM rental_order_workflow WHERE order_no=? FOR UPDATE', [ref]);
      const w = workflows[0] || {};
      if ((w.payment_status && !['unpaid', 'rejected'].includes(w.payment_status)) || w.disputed_at || w.resolved_at || w.owner_complete_requested_at || w.renter_confirmed_at)
        fail('租单已有付款、争议或交付记录，不能按未付款取消');
      const [reviews] = await conn.execute('SELECT order_no FROM rental_payment_reviews WHERE order_no=? UNION ALL SELECT order_no FROM rental_refund_reviews WHERE order_no=? UNION ALL SELECT order_no FROM rental_settlement_resolutions WHERE order_no=?', [ref, ref, ref]);
      if (reviews.length) fail('租单已有收款、退款或结算记录，请核对后处理');
    }
    const [evidence] = await conn.execute('SELECT id FROM manual_payment_evidence WHERE business_type=? AND business_ref=? LIMIT 1', [sourceType, ref]);
    if (evidence.length) fail('订单存在付款凭证，请核对后处理');
    const [ledger] = await conn.execute('SELECT * FROM account_ledger WHERE source_type=? AND source_ref=? ORDER BY id', [sourceType, ref]);
    const debitKey = type === 'boost' ? `order:${ref}:credits_debit` : `rental:${ref}:credits_debit`;
    // Only the original reservation debit is refundable here. Other entries need individual review.
    if (ledger.some(l => l.entry_key !== debitKey || l.account_type !== 'qy_credits' || Number(l.amount_delta) >= 0 || Number(l.user_id) !== Number(order[ownerColumn])))
      fail('订单包含其他资金流水，请人工核对后处理');
    if (ledger.length > 1) fail('积分扣减记录不唯一，请人工核对');
    const refund = ledger.length ? -Number(ledger[0].amount_delta) : 0;
    if (type === 'rental' && refund !== Number(order.credits_used || 0)) fail('历史积分抵扣缺少匹配流水，请人工核对，不能自动退款');
    if (refund > 0) await postAccountDelta(conn, { userId: order[ownerColumn], accountType: 'qy_credits', delta: refund,
      entryKey: type === 'boost' ? `order:${ref}:credits_refund` : `rental:${ref}:credits_refund`, sourceType, sourceRef: ref, actorUserId: actor });
    await conn.execute(`UPDATE ${table} SET status='cancelled' WHERE id=?`, [order.id]);
    await event(conn, recordOperation, type, ref, actor, timeout ? 'unpaid_timeout_closed' : 'unpaid_cancelled', reason);
    await conn.commit();
    return { success: true, refunded_credits: refund };
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}

async function timeoutSettings(pool) {
  const [rows] = await pool.execute('SELECT timeout_enabled FROM order_lifecycle_settings WHERE id=1');
  return { enabled: Boolean(rows[0]?.timeout_enabled), hours: TIMEOUT_HOURS };
}

async function timeoutCandidates(pool) {
  const [rows] = await pool.execute(`SELECT 'boost' AS type,o.order_no AS ref,o.created_at FROM orders o
    WHERE o.status='pending' AND o.payment_status='unpaid' AND o.booster_id IS NULL AND o.hall_status IS NULL AND o.payment_screenshot IS NULL
    AND NOT EXISTS (SELECT 1 FROM order_removals r WHERE r.order_type='boost' AND r.order_ref=o.order_no)
    AND NOT EXISTS (SELECT 1 FROM manual_payment_evidence e WHERE e.business_type='order' AND e.business_ref=o.order_no)
    AND NOT EXISTS (SELECT 1 FROM account_ledger l WHERE l.source_type='order' AND l.source_ref=o.order_no
      AND (l.entry_key!=CONCAT('order:',o.order_no,':credits_debit') OR l.account_type!='qy_credits' OR l.amount_delta>=0 OR l.user_id!=o.user_id))
    AND o.created_at<=DATE_SUB(NOW(),INTERVAL 24 HOUR)
    UNION ALL SELECT 'rental',o.order_no,o.created_at FROM rental_orders o
    LEFT JOIN rental_order_workflow w ON w.order_no=o.order_no
    WHERE o.status='pending' AND COALESCE(w.payment_status,'unpaid') IN ('unpaid','rejected')
    AND NOT EXISTS (SELECT 1 FROM order_removals r WHERE r.order_type='rental' AND r.order_ref=o.order_no)
    AND w.disputed_at IS NULL AND w.resolved_at IS NULL AND w.owner_complete_requested_at IS NULL AND w.renter_confirmed_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM manual_payment_evidence e WHERE e.business_type='rental_order' AND e.business_ref=o.order_no)
    AND NOT EXISTS (SELECT 1 FROM rental_payment_reviews r WHERE r.order_no=o.order_no)
    AND NOT EXISTS (SELECT 1 FROM rental_refund_reviews r WHERE r.order_no=o.order_no)
    AND NOT EXISTS (SELECT 1 FROM rental_settlement_resolutions r WHERE r.order_no=o.order_no)
    AND NOT EXISTS (SELECT 1 FROM account_ledger l WHERE l.source_type='rental_order' AND l.source_ref=o.order_no
      AND (l.entry_key!=CONCAT('rental:',o.order_no,':credits_debit') OR l.account_type!='qy_credits' OR l.amount_delta>=0 OR l.user_id!=o.renter_id))
    AND COALESCE(o.credits_used,0)=COALESCE((SELECT -l.amount_delta FROM account_ledger l
      WHERE l.source_type='rental_order' AND l.source_ref=o.order_no AND l.entry_key=CONCAT('rental:',o.order_no,':credits_debit')
      AND l.account_type='qy_credits' AND l.user_id=o.renter_id AND l.amount_delta<0),0)
    AND o.created_at<=DATE_SUB(NOW(),INTERVAL 24 HOUR) ORDER BY created_at LIMIT 200`);
  // Filter protected records before LIMIT, so old exceptions cannot starve later eligible orders.
  // Each mutation repeats these checks under a source-row lock.
  return rows;
}

async function closeExpired(deps, actor = null, force = false) {
  if (!force && !(await timeoutSettings(deps.pool)).enabled) return { closed: 0, skipped: 0, disabled: true };
  const rows = await timeoutCandidates(deps.pool);
  let closed = 0, skipped = 0;
  for (const row of rows) {
    try { const result = await cancelUnpaid({ ...deps, ...row, actor, admin: true, timeout: true, reason: '超过24小时未提交付款凭证，关闭未付款订单' }); if (!result.already_closed) closed++; }
    catch (err) { if (![404, 409].includes(err.status)) throw err; skipped++; }
  }
  return { closed, skipped, limit: 200 };
}

async function resolveRecharge({ pool, recordOperation, alipaySdk, ref, actor, outcome, reason, reference, confirmation }) {
  reason = reasonInput(reason);
  if (!['test_closed', 'historical_credited', 'tickets_backfilled'].includes(outcome) || typeof ref !== 'string' || !ref || ref.length > 64 ||
      typeof reference !== 'string' || !reference.trim() || reference.trim().length > 200 || confirmation !== 'REVIEWED_PAYMENT_AND_TICKETS')
    fail('请选择核对结果、填写核对依据，并确认已核对实际付款和发券记录', 400);
  // A backfill must be backed by a fresh signed provider query, not an administrator assertion.
  let trade;
  if (alipaySdk) {
    try { trade = await queryAlipayTrade(alipaySdk, ref); }
    catch { fail('支付宝查询失败，未执行核销，请稍后重试', 502); }
  }
  if (outcome === 'tickets_backfilled' && (!trade?.found || !ALIPAY_SUCCESS_STATUSES.has(trade.tradeStatus)))
    fail('补发必须启用支付宝并查询确认真实支付成功');
  if (outcome === 'test_closed' && trade?.found && trade.tradeStatus !== 'TRADE_CLOSED')
    fail('支付平台存在成功或尚未关闭的交易，不能作为无付款测试单核销');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM payment_orders WHERE out_trade_no=? FOR UPDATE', [ref]);
    const order = rows[0];
    if (!order) fail('订单不存在', 404);
    const [workflows] = await conn.execute('SELECT * FROM recharge_order_workflow WHERE out_trade_no=? FOR UPDATE', [ref]);
    const w = workflows[0] || {};
    const [resolved] = await conn.execute('SELECT * FROM recharge_order_resolutions WHERE out_trade_no=? FOR UPDATE', [ref]);
    const previous=resolved[0];
    const success = ALIPAY_SUCCESS_STATUSES.has(w.provider_status);
    if (previous && previous.status_snapshot===order.status && (previous.trade_snapshot||null)===(order.alipay_trade_no||null) && !(previous.outcome==='test_closed' && success))
      fail('该订单已有核销记录，请刷新查看，不能重复核销');
    const [ledger] = await conn.execute("SELECT * FROM account_ledger WHERE source_type='payment_order' AND source_ref=? ORDER BY id", [ref]);
    if (ledger.length) fail('订单已有资金流水，请核对现有流水，不能再次核销或补发');
    if (!(order.status === 'paid' || (order.status === 'closed' && success) || (order.status === 'pending' && success)))
      fail('仅允许核销到账异常或到账处理中的充值订单');
    if (trade?.found && (amountToCents(order.amount) !== amountToCents(trade.totalAmount) || (order.alipay_trade_no && order.alipay_trade_no !== trade.tradeNo)))
      fail('支付金额或交易号与本地记录不一致，请先核对');
    if (outcome === 'test_closed' && success) fail('已有支付成功记录，不能作为无付款测试单核销');
    if (outcome === 'historical_credited' && order.status !== 'paid') fail('只有历史已支付订单可以登记已到账；其他订单请核实支付后补发');
    if (outcome === 'historical_credited' && trade?.found && !ALIPAY_SUCCESS_STATUSES.has(trade.tradeStatus)) fail('支付平台未确认支付成功，不能登记历史已到账');
    if (outcome === 'tickets_backfilled') {
      const quantity = Number(w.ticket_quantity ?? 10000);
      if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1000000) fail('充值数量快照异常，请先核对');
      await postAccountDelta(conn, { userId: order.user_id, accountType: 'chest_tickets', delta: quantity,
        entryKey: `payment:${ref}:tickets_credited`, sourceType: 'payment_order', sourceRef: ref, actorUserId: actor });
      await conn.execute("UPDATE payment_orders SET status='paid',alipay_trade_no=?,paid_at=COALESCE(paid_at,NOW()) WHERE out_trade_no=?", [trade.tradeNo, ref]);
      await conn.execute(`INSERT INTO recharge_order_workflow (out_trade_no,ticket_quantity,provider_status,provider_checked_at,credited_at)
        VALUES (?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE provider_status=VALUES(provider_status),provider_checked_at=NOW(),credited_at=NOW(),credit_error_code=NULL`, [ref, quantity, trade.tradeStatus]);
    }
    await conn.execute(`INSERT INTO recharge_order_resolutions (out_trade_no,outcome,status_snapshot,trade_snapshot,reviewed_by,reason,evidence_reference)
      VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE outcome=VALUES(outcome),status_snapshot=VALUES(status_snapshot),trade_snapshot=VALUES(trade_snapshot),reviewed_by=VALUES(reviewed_by),reason=VALUES(reason),evidence_reference=VALUES(evidence_reference),reviewed_at=NOW()`, [ref, outcome, outcome === 'tickets_backfilled' ? 'paid' : order.status,
      outcome === 'tickets_backfilled' ? trade.tradeNo : (order.alipay_trade_no||null), actor, reason, reference.trim()]);
    await event(conn, recordOperation, 'recharge', ref, actor, `recharge_${outcome}`, `${reason}；核对依据：${reference.trim()}`.slice(0, 500));
    await conn.commit(); return { success: true, outcome };
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
}

module.exports = { cancelUnpaid, timeoutSettings, timeoutCandidates, closeExpired, resolveRecharge, reasonInput, TIMEOUT_HOURS };
