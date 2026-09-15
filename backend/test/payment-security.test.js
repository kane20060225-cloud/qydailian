'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RECHARGE_TICKETS,
  createOutTradeNo,
  processAlipayNotification,
  queryAlipayTrade,
  reconcileAlipayTrade,
  validateAlipayConfiguration,
  validateAlipayNotification
} = require('../lib/payment-security');

const OUT_TRADE_NO = 'RC1700000000000ABCDEF';
const TRADE_NO = '202609142200100000000001';

function validNotification(overrides = {}) {
  return {
    out_trade_no: OUT_TRADE_NO,
    trade_no: TRADE_NO,
    trade_status: 'TRADE_SUCCESS',
    total_amount: '6.00',
    app_id: '2026000000000001',
    seller_id: '2088000000000001',
    ...overrides
  };
}

function createFakePool(initialOrder, options = {}) {
  const state = {
    order: initialOrder ? { ...initialOrder } : null,
    tickets: 0,
    creditUpdates: 0,
    ledger: [],
    audit: [],
    commits: 0,
    rollbacks: 0,
    releases: 0
  };
  let snapshot;

  const connection = {
    async beginTransaction() {
      snapshot = {
        order: state.order ? { ...state.order } : null,
        tickets: state.tickets,
        creditUpdates: state.creditUpdates,
        ledger: structuredClone(state.ledger),
        audit: structuredClone(state.audit)
      };
    },
    async execute(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();

      if (normalized.startsWith('SELECT id, user_id, amount, status, alipay_trade_no')) {
        return [state.order && state.order.out_trade_no === params[0] ? [{ ...state.order }] : []];
      }

      if (normalized.includes("SET status = 'paid'")) {
        const [tradeNo, orderId] = params;
        if (state.order?.id !== orderId || state.order.status !== 'pending') {
          return [{ affectedRows: 0 }];
        }
        state.order.status = 'paid';
        state.order.alipay_trade_no = tradeNo;
        state.order.paid_at = 'now';
        return [{ affectedRows: 1 }];
      }

      if (normalized.startsWith('UPDATE users SET chest_tickets')) {
        const [ticketCredit, userId] = params;
        if (options.userExists === false || state.order?.user_id !== userId) {
          return [{ affectedRows: 0 }];
        }
        state.tickets += ticketCredit;
        state.creditUpdates += 1;
        return [{ affectedRows: 1 }];
      }

      if (normalized === 'SELECT chest_tickets AS balance FROM users WHERE id = ? FOR UPDATE') {
        if (options.userExists === false) return [[]];
        return [[{ balance: state.tickets }]];
      }

      if (normalized.startsWith('INSERT INTO account_ledger')) {
        if (options.failLedger) throw new Error('ledger unavailable');
        state.ledger.push(params);
        return [{ affectedRows: 1 }];
      }

      if (normalized.startsWith('INSERT INTO operation_audit')) {
        if (options.failAudit) throw new Error('audit unavailable');
        state.audit.push(params);
        return [{ affectedRows: 1 }];
      }

      if (normalized.includes("SET status = 'closed'")) {
        const [tradeNo, orderId] = params;
        if (state.order?.id !== orderId || state.order.status !== 'pending') {
          return [{ affectedRows: 0 }];
        }
        state.order.status = 'closed';
        state.order.alipay_trade_no = tradeNo;
        state.order.closed_at = 'now';
        return [{ affectedRows: 1 }];
      }

      if (normalized.includes('SET alipay_trade_no = COALESCE')) {
        const [tradeNo, orderId] = params;
        if (state.order?.id !== orderId || state.order.status !== 'paid') {
          return [{ affectedRows: 0 }];
        }
        state.order.alipay_trade_no ||= tradeNo;
        state.order.paid_at ||= 'now';
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected SQL in fake connection: ${normalized}`);
    },
    async commit() {
      state.commits += 1;
      snapshot = undefined;
    },
    async rollback() {
      state.rollbacks += 1;
      if (snapshot) {
        state.order = snapshot.order;
        state.tickets = snapshot.tickets;
        state.creditUpdates = snapshot.creditUpdates;
        state.ledger = snapshot.ledger;
        state.audit = snapshot.audit;
        snapshot = undefined;
      }
    },
    release() {
      state.releases += 1;
    }
  };

  return {
    state,
    async getConnection() {
      return connection;
    }
  };
}

function pendingOrder(overrides = {}) {
  return {
    id: 1,
    out_trade_no: OUT_TRADE_NO,
    user_id: 42,
    amount: 6,
    status: 'pending',
    alipay_trade_no: null,
    ...overrides
  };
}

function processWith(pool, notification = validNotification()) {
  return processAlipayNotification({
    pool,
    notification,
    expectedAppId: '2026000000000001',
    expectedSellerId: '2088000000000001'
  });
}

test('requires an explicit matching Alipay environment and gateway', () => {
  const base = {
    ALIPAY_ENVIRONMENT: 'sandbox',
    ALIPAY_APP_ID: '2026000000000001',
    ALIPAY_SELLER_ID: '2088000000000001',
    ALIPAY_GATEWAY: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
    ALIPAY_NOTIFY_URL: 'https://staging.example.com/api/chest/alipay/notify',
    ALIPAY_RETURN_URL: 'https://staging.example.com/'
  };

  assert.equal(validateAlipayConfiguration(base).environment, 'sandbox');
  assert.throws(
    () => validateAlipayConfiguration({ ...base, ALIPAY_ENVIRONMENT: 'production' }),
    /不匹配/
  );
});

test('creates non-predictable order numbers with the expected prefix', () => {
  const first = createOutTradeNo(1700000000000);
  const second = createOutTradeNo(1700000000000);
  assert.match(first, /^RC1700000000000[A-F0-9]{10}$/);
  assert.notEqual(first, second);
});

test('rejects a notification for another app or seller', () => {
  assert.throws(
    () => validateAlipayNotification(validNotification({ app_id: '2026000000000999' }), {
      appId: '2026000000000001',
      sellerId: '2088000000000001'
    }),
    (error) => error.code === 'APP_ID_MISMATCH'
  );
  assert.throws(
    () => validateAlipayNotification(validNotification({ seller_id: '2088000000000999' }), {
      appId: '2026000000000001',
      sellerId: '2088000000000001'
    }),
    (error) => error.code === 'SELLER_ID_MISMATCH'
  );
});

test('credits a valid pending payment atomically', async () => {
  const pool = createFakePool(pendingOrder());
  const result = await processWith(pool);

  assert.deepEqual(result, { acknowledge: true, outcome: 'credited' });
  assert.equal(pool.state.order.status, 'paid');
  assert.equal(pool.state.order.alipay_trade_no, TRADE_NO);
  assert.equal(pool.state.tickets, RECHARGE_TICKETS);
  assert.equal(pool.state.creditUpdates, 1);
  assert.equal(pool.state.ledger.length, 1);
  assert.equal(pool.state.ledger[0][3], RECHARGE_TICKETS);
  assert.equal(pool.state.audit.length, 1);
  assert.equal(pool.state.commits, 1);
});

test('acknowledges a duplicate success notification without double credit', async () => {
  const pool = createFakePool(pendingOrder());
  await processWith(pool);
  const duplicate = await processWith(pool);

  assert.deepEqual(duplicate, { acknowledge: true, outcome: 'duplicate_paid' });
  assert.equal(pool.state.tickets, RECHARGE_TICKETS);
  assert.equal(pool.state.creditUpdates, 1);
  assert.equal(pool.state.ledger.length, 1);
});

test('rejects an incorrect amount without changing tickets or order state', async () => {
  const pool = createFakePool(pendingOrder());
  const result = await processWith(pool, validNotification({ total_amount: '0.01' }));

  assert.deepEqual(result, { acknowledge: false, outcome: 'amount_mismatch' });
  assert.equal(pool.state.order.status, 'pending');
  assert.equal(pool.state.tickets, 0);
  assert.equal(pool.state.creditUpdates, 0);
});

test('does not reverse a paid order when a late closed notification arrives', async () => {
  const pool = createFakePool(pendingOrder());
  await processWith(pool);
  const lateClose = await processWith(pool, validNotification({ trade_status: 'TRADE_CLOSED' }));

  assert.deepEqual(lateClose, { acknowledge: true, outcome: 'ignored_after_paid' });
  assert.equal(pool.state.order.status, 'paid');
  assert.equal(pool.state.tickets, RECHARGE_TICKETS);
});

test('does not credit a success notification after the local order was closed', async () => {
  const pool = createFakePool(pendingOrder());
  const closed = await processWith(pool, validNotification({ trade_status: 'TRADE_CLOSED' }));
  const lateSuccess = await processWith(pool);

  assert.deepEqual(closed, { acknowledge: true, outcome: 'closed' });
  assert.deepEqual(lateSuccess, { acknowledge: false, outcome: 'paid_after_closed' });
  assert.equal(pool.state.order.status, 'closed');
  assert.equal(pool.state.tickets, 0);
});

test('backfills a provider reference on a legacy paid order without crediting again', async () => {
  const pool = createFakePool(pendingOrder({ status: 'paid' }));
  const result = await processWith(pool);

  assert.deepEqual(result, { acknowledge: true, outcome: 'duplicate_paid' });
  assert.equal(pool.state.order.alipay_trade_no, TRADE_NO);
  assert.equal(pool.state.tickets, 0);
  assert.equal(pool.state.creditUpdates, 0);
});

test('returns fail semantics for an unknown merchant order', async () => {
  const pool = createFakePool(null);
  const result = await processWith(pool);

  assert.deepEqual(result, { acknowledge: false, outcome: 'unknown_order' });
  assert.equal(pool.state.rollbacks, 1);
  assert.equal(pool.state.releases, 1);
});

test('rolls back the paid transition if the user credit update fails', async () => {
  const pool = createFakePool(pendingOrder(), { userExists: false });

  await assert.rejects(() => processWith(pool), (error) => error.code === 'PAYMENT_USER_NOT_FOUND');
  assert.equal(pool.state.order.status, 'pending');
  assert.equal(pool.state.order.alipay_trade_no, null);
  assert.equal(pool.state.tickets, 0);
  assert.equal(pool.state.commits, 0);
  assert.equal(pool.state.rollbacks, 1);
});

test('a failed B5 ledger insert rolls back both payment state and ticket credit', async () => {
  const pool = createFakePool(pendingOrder(), { failLedger: true });
  await assert.rejects(() => processWith(pool), /ledger unavailable/);
  assert.equal(pool.state.order.status, 'pending');
  assert.equal(pool.state.tickets, 0);
  assert.equal(pool.state.ledger.length, 0);
  assert.equal(pool.state.audit.length, 0);
  assert.equal(pool.state.commits, 0);
  assert.equal(pool.state.rollbacks, 1);
});

test('queries Alipay with signed-response validation and returns sanitized fields', async () => {
  const calls = [];
  const alipaySdk = {
    async exec(method, params, options) {
      calls.push({ method, params, options });
      return {
        code: '10000',
        outTradeNo: OUT_TRADE_NO,
        tradeNo: TRADE_NO,
        tradeStatus: 'TRADE_SUCCESS',
        totalAmount: '6.00'
      };
    }
  };

  const result = await queryAlipayTrade(alipaySdk, OUT_TRADE_NO);
  assert.equal(result.found, true);
  assert.equal(result.tradeStatus, 'TRADE_SUCCESS');
  assert.equal(calls[0].method, 'alipay.trade.query');
  assert.deepEqual(calls[0].params, { bizContent: { out_trade_no: OUT_TRADE_NO } });
  assert.deepEqual(calls[0].options, { validateSign: true });
});

test('reconciles a signed provider result through the same idempotent credit path', async () => {
  const pool = createFakePool(pendingOrder());
  const alipaySdk = {
    async exec() {
      return {
        code: '10000',
        out_trade_no: OUT_TRADE_NO,
        trade_no: TRADE_NO,
        trade_status: 'TRADE_SUCCESS',
        total_amount: '6.00'
      };
    }
  };

  const first = await reconcileAlipayTrade({
    pool,
    alipaySdk,
    outTradeNo: OUT_TRADE_NO,
    expectedAppId: '2026000000000001',
    expectedSellerId: '2088000000000001'
  });
  const duplicate = await reconcileAlipayTrade({
    pool,
    alipaySdk,
    outTradeNo: OUT_TRADE_NO,
    expectedAppId: '2026000000000001',
    expectedSellerId: '2088000000000001'
  });

  assert.deepEqual(first, { acknowledge: true, outcome: 'credited' });
  assert.deepEqual(duplicate, { acknowledge: true, outcome: 'duplicate_paid' });
  assert.equal(pool.state.tickets, RECHARGE_TICKETS);
  assert.equal(pool.state.creditUpdates, 1);
});
