'use strict';

const THIRD_PARTY_PLATFORMS = Object.freeze([
  '安卓官服',
  'iOS官服',
  '亚服',
  '安卓渠道服',
  '其他服务器'
]);

function cleanText(value, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length <= maxLength ? text : '';
}

function normalizePlatform(value) {
  return THIRD_PARTY_PLATFORMS.includes(value) ? value : '其他服务器';
}

function validateOrderInput(body = {}) {
  const platform = cleanText(body.platform, 50);
  const content = cleanText(body.content, 2000);
  const accountInfo = cleanText(body.account_info, 200);
  const externalOrderNo = cleanText(body.external_order_no, 80);
  const price = Number(body.price);
  const expectedAt = cleanText(body.expected_at, 30);

  if (!THIRD_PARTY_PLATFORMS.includes(platform)) return { error: '请选择有效的游戏服务器' };
  if (!content) return { error: '请填写代练内容（最多 2000 字）' };
  if (!accountInfo) return { error: '请填写账号信息（最多 200 字）' };
  if (!Number.isFinite(price) || price <= 0 || price > 999999.99) return { error: '请输入有效价格' };
  if (body.external_order_no && !externalOrderNo) return { error: '外部订单号最多 80 字' };
  if (expectedAt && Number.isNaN(Date.parse(expectedAt))) return { error: '预计完成时间格式无效' };
  return {
    value: {
      platform,
      content,
      accountInfo,
      price: price.toFixed(2),
      externalOrderNo: externalOrderNo || null,
      expectedAt: expectedAt ? new Date(expectedAt) : null
    }
  };
}

function getWorkflowStage(order) {
  if (order.final_status === 'completed') return 'completed';
  if (order.status === 'pending') return 'pending';
  if (order.status === 'rejected') return 'rejected';
  if (order.status === 'approved' && Number(order.complete_requested) === 1) return 'awaiting_acceptance';
  if (order.status === 'approved') return 'in_progress';
  return 'unknown';
}

function canReview(order) {
  return order?.status === 'pending';
}

function canResubmit(order) {
  return order?.status === 'rejected' && order.payment_status !== 'paid' && !order.final_status;
}

function canRequestCompletion(order) {
  return order?.status === 'approved' && !order.final_status && !Number(order.complete_requested);
}

function canReturnCompletion(order) {
  return order?.status === 'approved' && Number(order.complete_requested) === 1 && !order.final_status;
}

function canConfirmPayment(order) {
  return order?.status === 'approved' && order.payment_status !== 'paid' && !order.final_status;
}

module.exports = {
  THIRD_PARTY_PLATFORMS,
  cleanText,
  normalizePlatform,
  validateOrderInput,
  getWorkflowStage,
  canReview,
  canResubmit,
  canRequestCompletion,
  canReturnCompletion,
  canConfirmPayment
};
