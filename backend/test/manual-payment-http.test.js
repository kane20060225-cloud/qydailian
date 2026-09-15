'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const mysql = require('mysql2/promise');
const { issueSessionToken } = require('../lib/auth-session');

process.env.JWT_SECRET = 'b5-test-only-jwt';
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'test-user';
process.env.DB_PASSWORD = 'test-password';
process.env.DB_NAME = 'test-db';
process.env.ALIPAY_ENABLED = 'false';

const state = { exists: true, paymentStatus: 'unpaid', screenshot: null,
  evidence: [], audit: [], files: [], failEvidence: false };
const conn = {
  saved: null,
  async beginTransaction() {
    this.saved = { paymentStatus: state.paymentStatus, screenshot: state.screenshot,
      evidence: structuredClone(state.evidence), audit: structuredClone(state.audit) };
  },
  async commit() { this.saved = null; },
  async rollback() {
    if (this.saved) Object.assign(state, this.saved);
    this.saved = null;
  },
  release() {},
  async execute(sql, params) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id, total_price, payment_status FROM orders')) {
      return [state.exists ? [{ id: 1, total_price: 4.5, payment_status: state.paymentStatus }] : []];
    }
    if (q.startsWith('UPDATE orders SET payment_screenshot')) {
      state.screenshot = params[0];
      state.paymentStatus = params[1];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO manual_payment_evidence')) {
      if (state.failEvidence) throw new Error('evidence unavailable');
      state.evidence.push({ id: state.evidence.length + 1, businessRef: params[1],
        filename: params[3], amount: params[4], status: 'submitted' });
      return [{ insertId: state.evidence.length }];
    }
    if (q.startsWith('SELECT id, user_id, payment_status FROM orders')) {
      return [state.exists ? [{ id: 1, user_id: 3, payment_status: state.paymentStatus }] : []];
    }
    if (q.startsWith('UPDATE orders SET payment_status')) {
      state.paymentStatus = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('SELECT id FROM manual_payment_evidence')) {
      const latest = state.evidence.filter((e) => e.status === 'submitted').at(-1);
      return [latest ? [{ id: latest.id }] : []];
    }
    if (q.startsWith('UPDATE manual_payment_evidence')) {
      state.evidence.find((e) => e.id === params[2]).status = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO operation_audit')) {
      state.audit.push(params);
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${q}`);
  }
};
const fakePool = {
  getConnection: async () => conn,
  async execute(sql, params) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q === 'SELECT token_version FROM users WHERE id = ?') return [[{ token_version: 0 }]];
    if (q === 'SELECT role FROM users WHERE id = ?') return [[{ role: 'admin' }]];
    if (q.startsWith('SELECT id, payment_status FROM orders')) {
      return [state.exists && params[1] === 3
        ? [{ id: 1, payment_status: state.paymentStatus }] : []];
    }
    if (q.startsWith('INSERT INTO user_messages')) return [{ affectedRows: 1 }];
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

test('manual screenshot is linked to its existing order and only admin confirms payment', async (t) => {
  state.exists = true;
  state.paymentStatus = 'unpaid';
  state.screenshot = null;
  state.evidence = [];
  state.audit = [];
  state.files = [];
  state.failEvidence = false;
  const originalExists = fs.existsSync;
  const originalWrite = fs.writeFileSync;
  fs.existsSync = (filename) => filename.endsWith('uploads') || originalExists(filename);
  fs.writeFileSync = (filename) => { state.files.push(filename); };
  t.after(() => { fs.existsSync = originalExists; fs.writeFileSync = originalWrite; });
  const base = await serve(t);
  const customerToken = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const adminToken = issueSessionToken(7, 0, process.env.JWT_SECRET);
  const payment = await fetch(`${base}/api/orders/WOT-TEST/payment`, {
    method: 'POST', headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ screenshot: 'data:image/png;base64,dGVzdA==' })
  });
  assert.equal(payment.status, 200);
  assert.equal(state.paymentStatus, 'pending');
  assert.equal(state.evidence[0].businessRef, 'WOT-TEST');
  assert.equal(state.evidence[0].amount, 4.5);
  const approve = () => fetch(`${base}/api/admin/orders/WOT-TEST/confirm-payment`, {
    method: 'PUT', headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert.equal((await approve()).status, 200);
  assert.equal((await approve()).status, 409);
  assert.equal(state.paymentStatus, 'paid');
  assert.equal(state.evidence[0].status, 'accepted');
  assert.equal(state.audit.length, 2);
});

test('a screenshot cannot be attached to a missing order', async (t) => {
  state.exists = false;
  const base = await serve(t);
  const token = issueSessionToken(7, 0, process.env.JWT_SECRET);
  const response = await fetch(`${base}/api/orders/NO-ORDER/payment`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ screenshot: 'data:image/png;base64,dGVzdA==' })
  });
  assert.equal(response.status, 404);
});

test('failed evidence transaction removes only its new uncommitted screenshot', async (t) => {
  state.exists = true;
  state.paymentStatus = 'unpaid';
  state.screenshot = null;
  state.evidence = [];
  state.files = [];
  state.failEvidence = true;
  const originalExists = fs.existsSync;
  const originalWrite = fs.writeFileSync;
  const originalUnlink = fs.unlinkSync;
  fs.existsSync = (filename) => filename.endsWith('uploads') || originalExists(filename);
  fs.writeFileSync = (filename) => { state.files.push(filename); };
  fs.unlinkSync = (filename) => {
    assert.equal(state.files.includes(filename), true);
    state.files = state.files.filter((item) => item !== filename);
  };
  t.after(() => {
    fs.existsSync = originalExists;
    fs.writeFileSync = originalWrite;
    fs.unlinkSync = originalUnlink;
  });
  const base = await serve(t);
  const token = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const response = await fetch(`${base}/api/orders/WOT-TEST/payment`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ screenshot: 'data:image/png;base64,dGVzdA==' })
  });
  assert.equal(response.status, 500);
  assert.equal(state.paymentStatus, 'unpaid');
  assert.equal(state.screenshot, null);
  assert.equal(state.files.length, 0);
});
