'use strict';

const crypto = require('crypto');

const RECHARGE_AMOUNT = '6.00';
const RECHARGE_TICKETS = 10000;
const ALIPAY_SUCCESS_STATUSES = new Set(['TRADE_SUCCESS', 'TRADE_FINISHED']);
const ALIPAY_SUPPORTED_STATUSES = new Set([
  'WAIT_BUYER_PAY',
  'TRADE_CLOSED',
  ...ALIPAY_SUCCESS_STATUSES
]);
const OUT_TRADE_NO_PATTERN = /^RC\d{13}[A-Z0-9]{6,16}$/;

class PaymentNotificationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PaymentNotificationError';
    this.code = code;
  }
}

function requireText(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PaymentNotificationError('INVALID_NOTIFICATION', `缺少支付通知字段: ${fieldName}`);
  }
  return value.trim();
}

function amountToCents(value) {
  const text = String(value).trim();
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    throw new PaymentNotificationError('INVALID_AMOUNT', '支付金额格式无效');
  }

  const fractional = (match[2] || '').padEnd(2, '0');
  return Number(match[1]) * 100 + Number(fractional || 0);
}

function validateHttpsUrl(value, fieldName) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${fieldName} 必须是有效的 HTTPS URL`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${fieldName} 必须使用 HTTPS`);
  }
  return parsed;
}

function validateAlipayConfiguration(env) {
  const environment = env.ALIPAY_ENVIRONMENT;
  const allowedHosts = {
    sandbox: 'openapi-sandbox.dl.alipaydev.com',
    production: 'openapi.alipay.com'
  };
  if (!Object.hasOwn(allowedHosts, environment)) {
    throw new Error('ALIPAY_ENVIRONMENT 必须是 sandbox 或 production');
  }

  if (!/^\d{8,32}$/.test(env.ALIPAY_APP_ID || '')) {
    throw new Error('ALIPAY_APP_ID 格式无效');
  }
  if (!/^\d{8,32}$/.test(env.ALIPAY_SELLER_ID || '')) {
    throw new Error('ALIPAY_SELLER_ID 格式无效');
  }

  const gateway = validateHttpsUrl(env.ALIPAY_GATEWAY, 'ALIPAY_GATEWAY');
  if (gateway.hostname !== allowedHosts[environment] || gateway.pathname !== '/gateway.do') {
    throw new Error('ALIPAY_GATEWAY 与 ALIPAY_ENVIRONMENT 不匹配');
  }

  validateHttpsUrl(env.ALIPAY_NOTIFY_URL, 'ALIPAY_NOTIFY_URL');
  validateHttpsUrl(env.ALIPAY_RETURN_URL, 'ALIPAY_RETURN_URL');

  return {
    environment,
    appId: env.ALIPAY_APP_ID,
    sellerId: env.ALIPAY_SELLER_ID,
    gateway: gateway.toString()
  };
}

function createOutTradeNo(now = Date.now()) {
  return `RC${now}${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function isValidOutTradeNo(value) {
  return typeof value === 'string' && OUT_TRADE_NO_PATTERN.test(value);
}

function validateAlipayNotification(notification, expected) {
  const outTradeNo = requireText(notification.out_trade_no, 'out_trade_no');
  const tradeNo = requireText(notification.trade_no, 'trade_no');
  const tradeStatus = requireText(notification.trade_status, 'trade_status');
  const appId = requireText(notification.app_id, 'app_id');
  const sellerId = requireText(notification.seller_id, 'seller_id');

  if (!isValidOutTradeNo(outTradeNo)) {
    throw new PaymentNotificationError('INVALID_ORDER_NUMBER', '商户订单号格式无效');
  }
  if (!ALIPAY_SUPPORTED_STATUSES.has(tradeStatus)) {
    throw new PaymentNotificationError('UNSUPPORTED_TRADE_STATUS', '不支持的支付宝交易状态');
  }
  if (appId !== expected.appId) {
    throw new PaymentNotificationError('APP_ID_MISMATCH', '支付宝应用不匹配');
  }
  if (sellerId !== expected.sellerId) {
    throw new PaymentNotificationError('SELLER_ID_MISMATCH', '支付宝卖家不匹配');
  }

  return {
    outTradeNo,
    tradeNo,
    tradeStatus,
    amountCents: amountToCents(notification.total_amount)
  };
}

function decidePaymentTransition(order, notification) {
  if (amountToCents(order.amount) !== notification.amountCents) {
    return { acknowledge: false, outcome: 'amount_mismatch', action: 'none' };
  }

  if (order.alipay_trade_no && order.alipay_trade_no !== notification.tradeNo) {
    return { acknowledge: false, outcome: 'trade_no_mismatch', action: 'none' };
  }

  if (order.status === 'paid') {
    return {
      acknowledge: true,
      outcome: ALIPAY_SUCCESS_STATUSES.has(notification.tradeStatus)
        ? 'duplicate_paid'
        : 'ignored_after_paid',
      action: order.alipay_trade_no ? 'none' : 'record_paid_reference'
    };
  }

  if (order.status === 'closed') {
    return {
      acknowledge: !ALIPAY_SUCCESS_STATUSES.has(notification.tradeStatus),
      outcome: ALIPAY_SUCCESS_STATUSES.has(notification.tradeStatus)
        ? 'paid_after_closed'
        : 'duplicate_closed',
      action: 'none'
    };
  }

  if (order.status !== 'pending') {
    return { acknowledge: false, outcome: 'invalid_local_status', action: 'none' };
  }

  if (ALIPAY_SUCCESS_STATUSES.has(notification.tradeStatus)) {
    return { acknowledge: true, outcome: 'credited', action: 'credit' };
  }
  if (notification.tradeStatus === 'TRADE_CLOSED') {
    return { acknowledge: true, outcome: 'closed', action: 'close' };
  }
  return { acknowledge: true, outcome: 'waiting', action: 'none' };
}

async function processAlipayNotification(options) {
  const {
    pool,
    notification,
    expectedAppId,
    expectedSellerId,
    ticketCredit = RECHARGE_TICKETS
  } = options;
  const parsed = validateAlipayNotification(notification, {
    appId: expectedAppId,
    sellerId: expectedSellerId
  });
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [orders] = await connection.execute(
      `SELECT id, user_id, amount, status, alipay_trade_no
       FROM payment_orders
       WHERE out_trade_no = ?
       FOR UPDATE`,
      [parsed.outTradeNo]
    );

    if (orders.length === 0) {
      await connection.rollback();
      return { acknowledge: false, outcome: 'unknown_order' };
    }

    const order = orders[0];
    const transition = decidePaymentTransition(order, parsed);

    if (transition.action === 'credit') {
      const [orderUpdate] = await connection.execute(
        `UPDATE payment_orders
         SET status = 'paid', alipay_trade_no = ?, paid_at = NOW()
         WHERE id = ? AND status = 'pending'`,
        [parsed.tradeNo, order.id]
      );
      if (orderUpdate.affectedRows !== 1) {
        throw new PaymentNotificationError('CONCURRENT_PAYMENT_UPDATE', '支付订单状态并发变更');
      }

      const [userUpdate] = await connection.execute(
        'UPDATE users SET chest_tickets = chest_tickets + ? WHERE id = ?',
        [ticketCredit, order.user_id]
      );
      if (userUpdate.affectedRows !== 1) {
        throw new PaymentNotificationError('PAYMENT_USER_NOT_FOUND', '支付订单用户不存在');
      }
    } else if (transition.action === 'close') {
      const [orderUpdate] = await connection.execute(
        `UPDATE payment_orders
         SET status = 'closed', alipay_trade_no = ?, closed_at = NOW()
         WHERE id = ? AND status = 'pending'`,
        [parsed.tradeNo, order.id]
      );
      if (orderUpdate.affectedRows !== 1) {
        throw new PaymentNotificationError('CONCURRENT_PAYMENT_UPDATE', '支付订单状态并发变更');
      }
    } else if (transition.action === 'record_paid_reference') {
      await connection.execute(
        `UPDATE payment_orders
         SET alipay_trade_no = COALESCE(alipay_trade_no, ?), paid_at = COALESCE(paid_at, NOW())
         WHERE id = ? AND status = 'paid'`,
        [parsed.tradeNo, order.id]
      );
    }

    await connection.commit();
    return {
      acknowledge: transition.acknowledge,
      outcome: transition.outcome
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function responseField(result, camelCaseName, snakeCaseName) {
  return result?.[camelCaseName] ?? result?.[snakeCaseName];
}

function normalizeAlipayTradeQuery(result, expectedOutTradeNo) {
  if (!result || result.code !== '10000') {
    return {
      found: false,
      providerCode: result?.code || 'UNKNOWN',
      providerSubCode: result?.subCode || result?.sub_code || null
    };
  }

  const outTradeNo = responseField(result, 'outTradeNo', 'out_trade_no');
  if (outTradeNo !== expectedOutTradeNo) {
    throw new PaymentNotificationError('PROVIDER_ORDER_MISMATCH', '支付宝查询返回了其他商户订单');
  }

  const tradeStatus = requireText(
    responseField(result, 'tradeStatus', 'trade_status'),
    'trade_status'
  );
  if (!ALIPAY_SUPPORTED_STATUSES.has(tradeStatus)) {
    throw new PaymentNotificationError('UNSUPPORTED_TRADE_STATUS', '支付宝查询返回未知交易状态');
  }

  return {
    found: true,
    outTradeNo,
    tradeNo: requireText(responseField(result, 'tradeNo', 'trade_no'), 'trade_no'),
    tradeStatus,
    totalAmount: requireText(responseField(result, 'totalAmount', 'total_amount'), 'total_amount')
  };
}

async function queryAlipayTrade(alipaySdk, outTradeNo) {
  if (!isValidOutTradeNo(outTradeNo)) {
    throw new PaymentNotificationError('INVALID_ORDER_NUMBER', '商户订单号格式无效');
  }
  const result = await alipaySdk.exec(
    'alipay.trade.query',
    { bizContent: { out_trade_no: outTradeNo } },
    { validateSign: true }
  );
  return normalizeAlipayTradeQuery(result, outTradeNo);
}

async function reconcileAlipayTrade(options) {
  const {
    pool,
    alipaySdk,
    outTradeNo,
    expectedAppId,
    expectedSellerId,
    ticketCredit = RECHARGE_TICKETS
  } = options;
  const providerTrade = await queryAlipayTrade(alipaySdk, outTradeNo);
  if (!providerTrade.found) {
    return {
      acknowledge: false,
      outcome: 'provider_trade_not_found',
      providerCode: providerTrade.providerCode,
      providerSubCode: providerTrade.providerSubCode
    };
  }

  return processAlipayNotification({
    pool,
    notification: {
      out_trade_no: providerTrade.outTradeNo,
      trade_no: providerTrade.tradeNo,
      trade_status: providerTrade.tradeStatus,
      total_amount: providerTrade.totalAmount,
      app_id: expectedAppId,
      seller_id: expectedSellerId
    },
    expectedAppId,
    expectedSellerId,
    ticketCredit
  });
}

function maskTradeReference(value) {
  if (typeof value !== 'string' || value.length < 6) return 'unknown';
  return `***${value.slice(-6)}`;
}

module.exports = {
  ALIPAY_SUCCESS_STATUSES,
  PaymentNotificationError,
  RECHARGE_AMOUNT,
  RECHARGE_TICKETS,
  amountToCents,
  createOutTradeNo,
  decidePaymentTransition,
  isValidOutTradeNo,
  maskTradeReference,
  normalizeAlipayTradeQuery,
  processAlipayNotification,
  queryAlipayTrade,
  reconcileAlipayTrade,
  validateAlipayConfiguration,
  validateAlipayNotification
};
