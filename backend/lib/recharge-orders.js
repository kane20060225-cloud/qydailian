'use strict';

const {
  RECHARGE_TICKETS, RECHARGE_AMOUNT, createOutTradeNo, amountToCents,
  validateAlipayNotification, decidePaymentTransition, processAlipayNotification,
  queryAlipayTrade, ALIPAY_SUCCESS_STATUSES
} = require('./payment-security');

function paymentFormParams(order, env) {
  return {
    notify_url: env.ALIPAY_NOTIFY_URL,
    return_url: env.ALIPAY_RETURN_URL,
    bizContent: {
      out_trade_no: order.out_trade_no, total_amount: String(order.amount),
      subject: `情谊工具站充值 ${order.ticket_quantity} 军需券`,
      product_code: 'FAST_INSTANT_TRADE_PAY', timeout_express: '30m'
    }
  };
}

async function createRechargeOrder(pool, userId) {
  const outTradeNo = createOutTradeNo();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('INSERT INTO payment_orders (out_trade_no, user_id, amount) VALUES (?,?,?)',
      [outTradeNo, userId, RECHARGE_AMOUNT]);
    await conn.execute('INSERT INTO recharge_order_workflow (out_trade_no, ticket_quantity) VALUES (?,?)',
      [outTradeNo, RECHARGE_TICKETS]);
    await conn.execute(
      'INSERT INTO order_management_events (order_type, order_ref, actor_user_id, action) VALUES (?,?,?,?)',
      ['recharge', outTradeNo, userId, 'created']);
    await conn.commit();
    return { out_trade_no: outTradeNo, amount: RECHARGE_AMOUNT, ticket_quantity: RECHARGE_TICKETS };
  } catch (err) { await conn.rollback(); throw err; }
  finally { conn.release(); }
}

async function observeRecharge(pool, parsed) {
  const [orders] = await pool.execute(
    'SELECT id, user_id, amount, status, alipay_trade_no FROM payment_orders WHERE out_trade_no=?', [parsed.outTradeNo]);
  if (!orders.length) return false;
  const transition = decidePaymentTransition(orders[0], parsed);
  if (['amount_mismatch', 'trade_no_mismatch', 'invalid_local_status'].includes(transition.outcome)) return false;
  await pool.execute(
    `INSERT INTO recharge_order_workflow (out_trade_no, provider_status, provider_checked_at)
     VALUES (?,?,NOW()) ON DUPLICATE KEY UPDATE
     provider_status=IF(provider_status IN ('TRADE_SUCCESS','TRADE_FINISHED'), provider_status, VALUES(provider_status)),
     provider_checked_at=NOW()`, [parsed.outTradeNo, parsed.tradeStatus]);
  return true;
}

async function processTrackedRecharge(options) {
  const parsed = validateAlipayNotification(options.notification, {
    appId: options.expectedAppId, sellerId: options.expectedSellerId
  });
  // Observation records are separate from money changes. Invalid notifications cannot mark success.
  const observed = await observeRecharge(options.pool, parsed);
  try {
    const result = await processAlipayNotification(options);
    if (observed && ['credited', 'duplicate_paid'].includes(result.outcome)) {
      await options.pool.execute(
        `UPDATE recharge_order_workflow w JOIN account_ledger l
         ON l.entry_key=? AND l.account_type='chest_tickets' AND l.amount_delta>0
         SET w.credited_at=l.created_at, w.credit_error_code=NULL WHERE w.out_trade_no=?`,
        [`payment:${parsed.outTradeNo}:tickets_credited`, parsed.outTradeNo]).catch(() => {});
    }
    return result;
  } catch (err) {
    if (observed && ALIPAY_SUCCESS_STATUSES.has(parsed.tradeStatus)) {
      await options.pool.execute('UPDATE recharge_order_workflow SET credit_error_code=? WHERE out_trade_no=?',
        [String(err.code || 'CREDIT_TRANSACTION_FAILED').slice(0, 60), parsed.outTradeNo]).catch(() => {});
    }
    throw err;
  }
}

async function refreshRecharge({ pool, alipaySdk, outTradeNo, paymentConfig, credit = true }) {
  const trade = await queryAlipayTrade(alipaySdk, outTradeNo);
  if (!trade.found) return { found: false, outcome: 'provider_trade_not_found' };
  const notification = {
    out_trade_no: trade.outTradeNo, trade_no: trade.tradeNo, trade_status: trade.tradeStatus,
    total_amount: trade.totalAmount, app_id: paymentConfig.appId, seller_id: paymentConfig.sellerId
  };
  if (!credit) {
    const parsed = validateAlipayNotification(notification, paymentConfig);
    const valid = await observeRecharge(pool, parsed);
    if (!valid) throw new Error('Provider trade does not match the local order');
    return { found: true, tradeStatus: trade.tradeStatus, outcome: 'observed' };
  }
  const [rows] = await pool.execute('SELECT ticket_quantity FROM recharge_order_workflow WHERE out_trade_no=?', [outTradeNo]);
  const quantity = rows[0]?.ticket_quantity ?? RECHARGE_TICKETS;
  if (!Number.isSafeInteger(Number(quantity)) || Number(quantity) <= 0) throw new Error('Invalid recharge quantity');
  return { found: true, ...await processTrackedRecharge({
    pool, notification, expectedAppId: paymentConfig.appId, expectedSellerId: paymentConfig.sellerId,
    ticketCredit: Number(quantity)
  }) };
}

function canResumeRecharge(order) {
  return order.status === 'pending' && !ALIPAY_SUCCESS_STATUSES.has(order.provider_status) &&
    amountToCents(order.amount) === amountToCents(RECHARGE_AMOUNT) &&
    (!order.ticket_quantity || Number(order.ticket_quantity) === RECHARGE_TICKETS);
}

module.exports = { paymentFormParams, createRechargeOrder, processTrackedRecharge,
  refreshRecharge, canResumeRecharge };
