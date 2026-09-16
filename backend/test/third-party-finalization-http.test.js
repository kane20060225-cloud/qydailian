'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { issueSessionToken } = require('../lib/auth-session');

process.env.JWT_SECRET = 'b5-test-only-jwt';
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString('base64');
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'test-user';
process.env.DB_PASSWORD = 'test-password';
process.env.DB_NAME = 'test-db';
process.env.ALIPAY_ENABLED = 'false';

const state = { order: null, finalized: false, audit: false, failAudit: false };
const conn = {
  saved: null,
  async beginTransaction() { this.saved = { finalized: state.finalized, audit: state.audit }; },
  async commit() { this.saved = null; },
  async rollback() {
    if (!this.saved) return;
    state.finalized = this.saved.finalized;
    state.audit = this.saved.audit;
    this.saved = null;
  },
  release() {},
  async execute(sql) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT status, payment_status, complete_requested')) {
      return [state.order ? [state.order] : []];
    }
    if (q.startsWith('SELECT order_no FROM third_party_order_finalization')) {
      return [state.finalized ? [{ order_no: 'TP-TEST' }] : []];
    }
    if (q.startsWith('INSERT INTO third_party_order_finalization')) {
      state.finalized = true;
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO operation_audit')) {
      if (state.failAudit) throw new Error('audit unavailable');
      state.audit = true;
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO third_party_order_events')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected SQL: ${q}`);
  }
};
const fakePool = {
  getConnection: async () => conn,
  async execute(sql) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q === 'SELECT token_version FROM users WHERE id = ?') return [[{ token_version: 0 }]];
    if (q === 'SELECT role FROM users WHERE id = ?') return [[{ role: 'admin' }]];
    throw new Error(`Unexpected pool SQL: ${q}`);
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

test('finalization requires review, payment and completion request and is one-time', async (t) => {
  state.order = { status: 'approved', payment_status: 'unpaid', complete_requested: 1 };
  state.finalized = false;
  state.audit = false;
  state.failAudit = false;
  const base = await serve(t);
  const token = issueSessionToken(7, 0, process.env.JWT_SECRET);
  const request = () => fetch(`${base}/api/third-party-orders/TP-TEST/finalize`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal((await request()).status, 400);
  assert.equal(state.finalized, false);
  state.order.payment_status = 'paid';
  assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 409);
  assert.equal(state.finalized, true);
  assert.equal(state.audit, true);
});

test('audit failure rolls back final completion', async (t) => {
  state.order = { status: 'approved', payment_status: 'paid', complete_requested: 1 };
  state.finalized = false;
  state.audit = false;
  state.failAudit = true;
  const base = await serve(t);
  const token = issueSessionToken(7, 0, process.env.JWT_SECRET);
  const response = await fetch(`${base}/api/third-party-orders/TP-TEST/finalize`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 500);
  assert.equal(state.finalized, false);
});
