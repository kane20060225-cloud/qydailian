'use strict';
// Operational reminders, not service-level promises or automatic state changes.
const HOURS = {payment_review:4,awaiting_assignment:8,awaiting_activation:8,awaiting_acceptance:24,dispute:24,exception:1,credit_pending:.25,pending:24};
function operational(row, now = Date.now()) {
  const timestamp = row.stage_recorded_at || row.created_at;
  const elapsed = Math.max(0, (now - new Date(timestamp).getTime()) / 3600000);
  const threshold = row.admin_task==='deletion'?24:HOURS[row.state];
  const overdue = Boolean(threshold && Number.isFinite(elapsed) && elapsed >= threshold);
  const responsible = row.admin_task==='deletion'?'管理员审核删除申请':['exception','credit_pending','dispute','payment_review','pending'].includes(row.state) ? '管理员'
    : row.state === 'awaiting_assignment' ? (row.admin_task === 'review' ? '管理员安排派单' : '接单大厅打手（尚无人接单）')
    : row.state === 'awaiting_activation' ? `出租方 ${row.assignee_name || ''}`
    : row.state === 'in_progress' ? (row.order_type === 'boost' ? `打手 ${row.assignee_name || '待核对'}` : row.order_type === 'rental' ? `出租方 ${row.assignee_name || ''} / 租用方` : row.customer_name || '订单提交方')
    : row.state === 'awaiting_acceptance' ? (row.order_type === 'rental' ? '租用方确认，管理员跟进异常' : '管理员验收')
    : ['pending_payment','rejected'].includes(row.state) ? '下单用户' : '处理已结束';
  const severity = row.removed_at || !row.admin_task ? 0 : row.admin_task==='deletion' || ['dispute','exception','credit_pending'].includes(row.state) ? 3 : overdue ? 2 : row.urgent ? 2 : 1;
  return {responsible,waiting_hours:Number.isFinite(elapsed)?Number(elapsed.toFixed(2)):null,waiting_basis:row.stage_recorded_at?'stage':'created',reminder_hours:threshold || null,overdue,priority:severity,last_updated_at:row.last_updated_at || row.created_at};
}
function guidance(order, {details = [], events = [], warning, userId, admin = false} = {}) {
  const info = Object.fromEntries(details.map(d=>[d.label,d.value]));
  const own = Number(order.customer_id) === Number(userId);
  const related = Number(order.related_user_id) === Number(userId);
  const state = order.state;
  let headline = order.state_label, next = '处理已结束，可查看交付信息。', needsAction = false;
  const instructions = {
    pending_payment:['订单已创建，等待你付款','付款后上传凭证；管理员核实收款后继续处理。'],
    payment_review:['付款凭证已提交，等待管理员核实','无需重复付款。管理员核实实际收款后会更新状态。'],
    awaiting_assignment:['已核实收款，等待打手接单','无需再次付款，接单后可查看负责打手。'],
    awaiting_activation:['已核实收款，等待出租方确认租用','出租方确认后开始租用，请在租号板块查看账号交接。'],
    in_progress:[order.order_type === 'boost' ? '打手已接单，正在代练' : order.order_type === 'rental' ? '租用进行中' : '审核通过，订单执行中','关注站内状态更新；有问题可从下方处理入口反馈。'],
    awaiting_acceptance:[order.order_type === 'rental' ? '出租方已申请完成，等待你确认' : '已申请完成，等待管理员验收','核对交付结果，再确认完成；有异议请从处理入口反馈。'],
    rejected:['订单审核未通过，需要修改','根据下方驳回原因修改后重新提交。'],
    dispute:['争议已登记，等待管理员处理','保留交接和沟通记录，从租号处理入口查看处理结果。'],
    credit_pending:['支付已成功，到账处理中','请刷新状态，无需再次付款；持续未到账请联系管理员核对。'],
    exception:['订单状态需要管理员核对','请勿重复付款。联系管理员提供已有订单号和摘要。'],
    pending:['订单已提交，等待管理员审核','审核结果会在站内更新。']
  };
  if (instructions[state]) [headline,next] = instructions[state];
  if (order.order_type === 'recharge' && state === 'pending_payment') next = '继续支付已有充值订单；完成支付后刷新到账状态。';
  const reason = state === 'rejected' ? info['驳回原因']
    : order.order_type === 'rental' && order.payment_status === 'rejected' ? info['付款驳回原因']
    : state === 'dispute' ? info['争议原因'] : info['验收退回原因'];
  if (order.payment_status === 'rejected') { headline='付款凭证被驳回，需要补充材料';next='按驳回原因补充有效凭证，请先核对实际付款，避免重复支付。'; }
  needsAction = own && (['pending_payment','rejected'].includes(state) || order.payment_status === 'rejected' || (state === 'awaiting_acceptance' && order.order_type === 'rental')) || related && state === 'awaiting_activation';
  if (admin) {needsAction = Boolean(order.admin_task);next = state === 'awaiting_assignment' ? (order.admin_task === 'review' ? '核对服务信息后放入接单大厅。' : '订单已在大厅但尚无人接单，请跟进打手安排。') : state === 'payment_review' ? '核对真实收款与凭证，再确认或说明驳回原因。' : state === 'dispute' ? '核对交接与争议依据，再裁决完成或核实退款。' : next;}
  if(order.order_type==='boost' && Number(order.amount)===0 && state==='payment_review'){headline='积分已抵扣全部金额，等待管理员核实';next=admin?'核对积分扣减记录和零元应付金额，填写核实说明后确认。':'无需转账或上传零元凭证，管理员核实积分抵扣后安排接单。';}
  if(order.deletion_status==='pending'){headline='删除申请已提交，等待管理员核对';next=admin?'核对重复、测试或历史异常的依据后，同意移入回收站或填写驳回原因。':'管理员审核后才会移入回收站，申请不会改动付款、余额或执行记录。';needsAction=admin;}
  if(order.removed_at){headline='订单已移入回收站';next=order.retention_protected?'已核对删除，原始付款、接单、交付与资金记录长期保留，不自动永久删除。管理员可恢复查看。':'可由管理员恢复，清理规则见下方到期说明。';needsAction=false;}
  const timestamps = [order.last_updated_at,order.created_at,...events.map(e=>e.created_at)].map(v=>new Date(v).getTime()).filter(Number.isFinite);
  const expected = info['预计完成'];
  const expectedMs = expected && expected !== '—' ? new Date(expected).getTime() : NaN;
  const delayed = Number.isFinite(expectedMs) && expectedMs < Date.now() && !['completed','closed','rejected'].includes(state);
  const feedback = Number.isFinite(expectedMs) ? `已登记预计完成时间：${new Date(expectedMs).toLocaleString('zh-CN')}${delayed?'（已超过预计时间，请从处理入口跟进）':''}`
    : ['completed','credited','closed'].includes(state) ? '处理已结束' : '尚未确认具体反馈时间；核实、接单或裁决后更新状态';
  return {headline,next,responsible:order.deletion_status==='pending'?'管理员审核删除申请':order.responsible || operational(order).responsible,needs_action:Boolean(needsAction),last_updated_at:timestamps.length?new Date(Math.max(...timestamps)).toISOString():null,feedback,delayed,reason:reason && reason !== '—' ? reason : ['dispute','rejected'].includes(state) || order.payment_status==='rejected' ? '历史记录未填写原因，请从处理入口联系管理员核对。' : null,warning};
}
module.exports = {operational,guidance,HOURS};
