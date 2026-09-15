'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { issueSessionToken } = require('../lib/auth-session');

process.env.JWT_SECRET = 'b5-test-only-jwt';
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'test-user';
process.env.DB_PASSWORD = 'test-password';
process.env.DB_NAME = 'test-db';
process.env.ALIPAY_ENABLED = 'false';

const state = { balance: 200, orders: [], ledger: [], audit: [], failLedger: false };
function snapshot() {
  return { balance: state.balance, orders: structuredClone(state.orders),
    ledger: structuredClone(state.ledger), audit: structuredClone(state.audit) };
}
const connection = {
  saved: null,
  async beginTransaction() { this.saved = snapshot(); },
  async commit() { this.saved = null; },
  async rollback() {
    if (!this.saved) return;
    Object.assign(state, this.saved);
    this.saved = null;
  },
  release() {},
  async execute(sql, params) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT * FROM rental_accounts') && q.endsWith('FOR UPDATE')) {
      return [[{ id: 9, owner_id: 8, hourly_price: 2, daily_price: 10 }]];
    }
    if (q.startsWith('SELECT id FROM rental_orders WHERE account_id')) {
      return [state.orders.filter((o) => o.status === 'pending' || o.status === 'active').map((o) => ({ id: o.id }))];
    }
    if (q === 'SELECT qy_credits FROM users WHERE id = ? FOR UPDATE' ||
        q === 'SELECT qy_credits AS balance FROM users WHERE id = ? FOR UPDATE') {
      return [[q.includes('AS balance') ? { balance: state.balance } : { qy_credits: state.balance }]];
    }
    if (q === 'UPDATE users SET qy_credits = ? WHERE id = ?') {
      state.balance = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO account_ledger')) {
      if (state.failLedger) throw new Error('ledger unavailable');
      state.ledger.push(params);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO rental_orders')) {
      state.orders.push({ id: 1, order_no: params[0], renter_id: params[1],
        owner_id: params[2], account_id: params[3], credits_used: params[7], status: 'pending' });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('SELECT * FROM rental_orders WHERE order_no') && q.endsWith('FOR UPDATE')) {
      return [state.orders.filter((o) => o.order_no === params[0] &&
        (o.renter_id === params[1] || o.owner_id === params[2]) &&
        (o.status === 'pending' || o.status === 'active'))];
    }
    if (q === 'UPDATE rental_orders SET status = ? WHERE id = ? AND status = ?') {
      const order = state.orders.find((o) => o.id === params[1] && o.status === params[2]);
      if (!order) return [{ affectedRows: 0 }];
      order.status = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO operation_audit')) {
      state.audit.push(params);
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected fake SQL: ${q}`);
  }
};
const fakePool = {
  getConnection: async () => connection,
  async execute(sql) {
    if (sql.trim() === 'SELECT token_version FROM users WHERE id = ?') {
      return [[{ token_version: 0 }]];
    }
    throw new Error(`Unexpected pool SQL: ${sql}`);
  }
};
const originalCreatePool = mysql.createPool;
mysql.createPool = () => fakePool;
const { app } = require('../server');
mysql.createPool = originalCreatePool;

async function serve(t) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

function reset() {
  state.balance = 200;
  state.orders = [];
  state.ledger = [];
  state.audit = [];
  state.failLedger = false;
}

test('one rental account cannot be booked twice while pending', async (t) => {
  reset();
  const base = await serve(t);
  const token = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const request = () => fetch(`${base}/api/rental/orders`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: 9, rental_type: 'hour', quantity: 1, use_credits: 100 })
  });
  assert.equal((await request()).status, 201);
  assert.equal((await request()).status, 400);
  assert.equal(state.orders.length, 1);
  assert.equal(state.balance, 100);
  assert.equal(state.ledger.length, 1);
});

test('cancel refunds deducted credits once in the same transaction', async (t) => {
  reset();
  state.balance = 100;
  state.orders = [{ id: 1, order_no: 'RNT-TEST', renter_id: 3, owner_id: 8,
    account_id: 9, credits_used: 100, status: 'pending' }];
  const base = await serve(t);
  const token = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const request = () => fetch(`${base}/api/rental/orders/RNT-TEST/cancel`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 400);
  assert.equal(state.balance, 200);
  assert.equal(state.orders[0].status, 'cancelled');
  assert.equal(state.ledger.length, 1);
});

test('ledger failure rolls back the booking and credit deduction', async (t) => {
  reset();
  state.failLedger = true;
  const base = await serve(t);
  const token = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const response = await fetch(`${base}/api/rental/orders`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: 9, rental_type: 'hour', quantity: 1, use_credits: 100 })
  });
  assert.equal(response.status, 400);
  assert.equal(state.balance, 200);
  assert.equal(state.orders.length, 0);
});
