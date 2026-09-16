'use strict';

const TYPES = Object.freeze(['boost', 'rental', 'recharge', 'shop', 'third_party']);
const STATES = Object.freeze({
  boost: { pending_payment: '待支付', payment_review: '待核实收款', awaiting_assignment: '待接单', in_progress: '代练中', completed: '已完成', closed: '已取消', exception: '状态待核对' },
  rental: { pending_payment: '待支付', payment_review: '待核实收款', awaiting_activation: '待确认租用', in_progress: '租用中', awaiting_acceptance: '待确认完成', dispute: '争议处理中', completed: '已完成', closed: '已取消' },
  recharge: { pending_payment: '待支付', credit_pending: '到账处理中', credited: '已到账', closed: '已关闭', exception: '到账待核对' },
  shop: { completed: '已兑换' },
  third_party: { pending: '待审核', in_progress: '进行中', awaiting_acceptance: '待验收', completed: '已完成', rejected: '已驳回' }
});

// A common read model; individual business tables remain the source of truth.
const ORDER_UNION_SQL = `
SELECT 'boost' AS order_type, o.order_no AS order_ref, CONCAT(o.project,' · ',o.detail) AS title,
 o.user_id AS customer_id, o.booster_id AS related_user_id, o.total_price AS amount, 'money' AS amount_unit,
 o.status AS business_status, o.payment_status, o.created_at, '人工核实' AS payment_channel,
 NULL AS payment_reference, NULL AS ticket_quantity, NULL AS credited_at, NULL AS provider_status,
 CASE WHEN o.status='cancelled' AND o.payment_status='unpaid' THEN 'closed'
 WHEN o.status='done' AND o.payment_status='paid' THEN 'completed'
 WHEN o.status IN ('done','playing') AND o.payment_status!='paid' THEN 'exception' WHEN o.status='playing' THEN 'in_progress'
 WHEN o.status='pending' AND o.payment_status='paid' THEN 'awaiting_assignment'
 WHEN o.status='pending' AND o.payment_status='pending' THEN 'payment_review'
 WHEN o.status='pending' THEN 'pending_payment' ELSE 'exception' END AS state,
 CASE WHEN o.status IN ('done','playing') AND o.payment_status!='paid' THEN 'exception'
 WHEN o.status!='done' AND o.payment_status='pending' THEN 'payment'
 WHEN o.status='pending' AND o.payment_status='paid' AND o.booster_id IS NULL AND o.hall_status IS NULL THEN 'review'
 ELSE NULL END AS admin_task, u.username AS customer_name, b.username AS assignee_name
FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN users b ON b.id=o.booster_id
UNION ALL
SELECT 'rental', o.order_no, CONCAT('账号租用 · ',o.quantity,IF(o.rental_type='day','天','小时')),
 o.renter_id,o.owner_id,o.total_price,'money',o.status,COALESCE(w.payment_status,'unpaid'),o.created_at,
 '人工核实',pr.payment_reference,NULL,NULL,NULL,
 CASE WHEN o.status='cancelled' THEN 'closed' WHEN o.status='completed' THEN 'completed'
 WHEN w.disputed_at IS NOT NULL AND w.resolved_at IS NULL THEN 'dispute'
 WHEN o.status='active' AND w.owner_complete_requested_at IS NOT NULL THEN 'awaiting_acceptance'
 WHEN o.status='active' THEN 'in_progress' WHEN w.payment_status='paid' THEN 'awaiting_activation'
 WHEN w.payment_status='submitted' THEN 'payment_review' ELSE 'pending_payment' END,
 CASE WHEN w.disputed_at IS NOT NULL AND w.resolved_at IS NULL AND o.status IN ('pending','active') THEN 'refund'
 WHEN o.status='pending' AND w.payment_status='submitted' THEN 'payment' ELSE NULL END,
 u.username,b.username
FROM rental_orders o JOIN users u ON u.id=o.renter_id JOIN users b ON b.id=o.owner_id
 LEFT JOIN rental_order_workflow w ON w.order_no=o.order_no
 LEFT JOIN rental_payment_reviews pr ON pr.order_no=o.order_no
UNION ALL
SELECT 'recharge',p.out_trade_no,CONCAT('军需券充值 · ',COALESCE(w.ticket_quantity,10000),'券'),
 p.user_id,NULL,p.amount,'money',p.status,IF(p.status='paid' OR w.provider_status IN ('TRADE_SUCCESS','TRADE_FINISHED'),'paid',IF(p.status='closed','closed','unpaid')),
 p.created_at,'支付宝',p.alipay_trade_no,w.ticket_quantity,l.created_at,w.provider_status,
 CASE WHEN p.status='paid' AND l.id IS NOT NULL THEN 'credited'
 WHEN r.outcome='historical_credited' AND r.status_snapshot=p.status AND r.trade_snapshot<=>p.alipay_trade_no AND p.status='paid' THEN 'credited'
 WHEN r.outcome='test_closed' AND r.status_snapshot=p.status AND r.trade_snapshot<=>p.alipay_trade_no
   AND COALESCE(w.provider_status,'') NOT IN ('TRADE_SUCCESS','TRADE_FINISHED') AND l.id IS NULL THEN 'closed'
 WHEN p.status='paid' THEN 'exception'
 WHEN p.status='closed' AND w.provider_status IN ('TRADE_SUCCESS','TRADE_FINISHED') THEN 'exception'
 WHEN p.status='closed' THEN 'closed'
 WHEN w.provider_status IN ('TRADE_SUCCESS','TRADE_FINISHED') THEN 'credit_pending' ELSE 'pending_payment' END,
 CASE WHEN r.outcome='historical_credited' AND r.status_snapshot=p.status AND r.trade_snapshot<=>p.alipay_trade_no AND p.status='paid' THEN NULL
 WHEN r.outcome='test_closed' AND r.status_snapshot=p.status AND r.trade_snapshot<=>p.alipay_trade_no
   AND COALESCE(w.provider_status,'') NOT IN ('TRADE_SUCCESS','TRADE_FINISHED') AND l.id IS NULL THEN NULL
 WHEN (p.status='paid' AND l.id IS NULL) OR
 (w.provider_status IN ('TRADE_SUCCESS','TRADE_FINISHED') AND p.status!='paid') THEN 'exception' ELSE NULL END,
 u.username,NULL
FROM payment_orders p JOIN users u ON u.id=p.user_id
 LEFT JOIN recharge_order_workflow w ON w.out_trade_no=p.out_trade_no
 LEFT JOIN recharge_order_resolutions r ON r.out_trade_no=p.out_trade_no
 LEFT JOIN account_ledger l ON l.entry_key=CONCAT('payment:',p.out_trade_no,':tickets_credited')
 AND l.user_id=p.user_id AND l.account_type='chest_tickets' AND l.amount_delta>0
UNION ALL
SELECT 'shop',CONCAT('SHOP',p.id),p.item_name,p.user_id,NULL,p.price_credits,'credits','completed','paid',p.purchased_at,
 '情谊积分',NULL,NULL,NULL,NULL,'completed',NULL,u.username,NULL
FROM qy_purchases p JOIN users u ON u.id=p.user_id
UNION ALL
SELECT 'third_party',o.order_no,o.content,o.creator_id,NULL,o.price,'money',o.status,o.payment_status,o.created_at,
 COALESCE(w.payment_channel,'人工核实'),w.payment_reference,NULL,NULL,NULL,
 CASE WHEN f.final_status='completed' THEN 'completed' WHEN o.status='pending' THEN 'pending'
 WHEN o.status='rejected' THEN 'rejected' WHEN o.complete_requested=1 THEN 'awaiting_acceptance' ELSE 'in_progress' END,
 CASE WHEN f.final_status='completed' OR o.status='rejected' THEN NULL WHEN o.status='pending' THEN 'review'
 WHEN o.payment_status!='paid' THEN 'payment' WHEN o.complete_requested=1 THEN 'acceptance' ELSE NULL END,
 u.username,NULL
FROM third_party_orders o JOIN users u ON u.id=o.creator_id
 LEFT JOIN third_party_order_finalization f ON f.order_no=o.order_no
 LEFT JOIN third_party_order_workflow w ON w.order_no=o.order_no
`;

const REMOVED_SQL = `CASE WHEN r.state_snapshot=c.state AND r.payment_snapshot=COALESCE(c.payment_status,'') THEN r.removed_at ELSE NULL END`;
const READ_MODEL_SQL = `SELECT c.*, a.archived_at, ${REMOVED_SQL} AS removed_at, DATE_ADD(${REMOVED_SQL},INTERVAL 14 DAY) AS purge_after, r.reason AS removal_reason FROM (${ORDER_UNION_SQL}) c
 LEFT JOIN order_management_state a ON a.order_type=c.order_type AND a.order_ref=c.order_ref
 LEFT JOIN order_removals r ON r.order_type=c.order_type AND r.order_ref=c.order_ref`;

function visibleOrdersSql(type, refSql) {
  if (!TYPES.includes(type) || !['orders.order_no','o.order_no','ro.order_no','t.order_no'].includes(refSql)) throw new Error('Invalid order visibility source');
  return `NOT EXISTS (SELECT 1 FROM (${READ_MODEL_SQL}) hidden_order WHERE hidden_order.order_type='${type}' AND hidden_order.order_ref=${refSql} AND hidden_order.removed_at IS NOT NULL)`;
}

function parseFilters(query = {}) {
  const type = String(query.type || '');
  if (type && !TYPES.includes(type)) throw new Error('无效订单类型');
  const state = String(query.state || '');
  const validStates = new Set(['todo', ...Object.values(STATES).flatMap(Object.keys)]);
  if (state && !validStates.has(state)) throw new Error('无效订单状态');
  const task = String(query.task || '');
  if (task && !['review','payment','acceptance','exception','refund'].includes(task)) throw new Error('无效待办类型');
  const search = String(query.search || '').trim().slice(0, 100);
  const from = String(query.from || '');
  const to = String(query.to || '');
  for (const date of [from, to]) {
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date)) throw new Error('日期格式无效');
  }
  if (from && to && from > to) throw new Error('起始日期不能晚于结束日期');
  const page = Number(query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error('无效页码');
  return { type, state, task, search, from, to, page, channel: String(query.channel || '').slice(0, 30),
    archived: query.archived === '1', trash: query.trash === '1' };
}

function filterClause(filters, { admin, userId, role, includeState = true }) {
  const conditions = []; const params = [];
  conditions.push(`${REMOVED_SQL} IS ${admin && filters.trash ? 'NOT ' : ''}NULL`);
  if (!admin) {
    conditions.push('(c.customer_id=? OR c.related_user_id=?)'); params.push(userId, userId);
    if (!['booster','admin'].includes(role)) conditions.push("c.order_type!='third_party'");
  } else if (!filters.trash) conditions.push(filters.archived ? 'a.archived_at IS NOT NULL' : 'a.archived_at IS NULL');
  if (filters.type) { conditions.push('c.order_type=?'); params.push(filters.type); }
  if (filters.search) {
    conditions.push('(c.order_ref LIKE ? OR c.payment_reference LIKE ? OR c.customer_name LIKE ? OR c.title LIKE ?)');
    // Treat %, _ and backslash as literal search text.
    const pattern = '%' + filters.search.replace(/[\\%_]/g, '\\$&') + '%';
    params.push(pattern, pattern, pattern, pattern);
  }
  if (filters.from) { conditions.push('c.created_at>=?'); params.push(filters.from); }
  if (filters.to) { conditions.push('c.created_at<DATE_ADD(?,INTERVAL 1 DAY)'); params.push(filters.to); }
  if (filters.channel) { conditions.push('c.payment_channel=?'); params.push(filters.channel); }
  if (includeState && filters.state === 'todo') {
    conditions.push(admin ? 'c.admin_task IS NOT NULL' : "c.state IN ('pending_payment','rejected','awaiting_activation','awaiting_acceptance','credit_pending','exception','dispute')");
  } else if (includeState && filters.state) { conditions.push('c.state=?'); params.push(filters.state); }
  if (includeState && filters.task) { conditions.push('c.admin_task=?'); params.push(filters.task); }
  return { sql: conditions.length ? ' WHERE ' + conditions.join(' AND ') : '', params };
}

function decorateOrder(row, userId, admin) {
  const own = Number(row.customer_id) === Number(userId);
  const related = Number(row.related_user_id) === Number(userId);
  const actions = [];
  if (row.removed_at) return { ...row, state_label: '已删除 · 可恢复', actions: admin ? ['restore'] : [] };
  if (row.order_type === 'recharge') {
    if (own && row.state === 'pending_payment') actions.push('pay');
    if (own && ['pending_payment','credit_pending','exception'].includes(row.state)) actions.push('refresh');
    if (admin) {
      actions.push('provider');
      if (row.business_status === 'pending' && row.state === 'credit_pending') actions.push('reconcile');
      if (['exception','credit_pending'].includes(row.state)) actions.push('resolve_recharge');
    }
  } else if (row.order_type === 'boost') {
    if (own && row.payment_status === 'unpaid' && !['completed','closed'].includes(row.state)) actions.push('boost_payment');
    if (admin && row.state === 'payment_review') actions.push('boost_confirm_payment');
    if (admin && row.state === 'awaiting_assignment' && row.admin_task === 'review') actions.push('boost_dispatch');
  } else if (row.order_type === 'rental') {
    if (admin || own || related) actions.push('rental_manage');
  } else if (row.order_type === 'third_party') actions.push('third_party_manage');
  if ((admin || own) && ['boost','rental'].includes(row.order_type) && row.state === 'pending_payment' && row.payment_status === 'unpaid') actions.push('cancel_unpaid');
  if (admin && ['completed','credited','closed'].includes(row.state)) actions.push(row.archived_at ? 'unarchive' : 'archive');
  if (admin && require('./order-cleanup').removable(row)) actions.push('remove');
  return { ...row, state_label: STATES[row.order_type]?.[row.state] || '状态待核对', actions };
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

module.exports = { TYPES, STATES, READ_MODEL_SQL, parseFilters, filterClause, decorateOrder, csvCell, visibleOrdersSql };
