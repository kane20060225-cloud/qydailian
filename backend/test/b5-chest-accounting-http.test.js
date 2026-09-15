'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { issueSessionToken } = require('../lib/auth-session');

process.env.JWT_SECRET = 'b5-test-only-jwt';
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'test-user';
process.env.DB_PASSWORD = 'test-password';
process.env.DB_NAME = 'test-db';
process.env.ALIPAY_ENABLED = 'false';

const state = { tickets: 0, lastDate: null, ledger: [], audit: [], rewards: [] };
const conn = {
  saved: null,
  async beginTransaction() { this.saved = structuredClone(state); },
  async commit() { this.saved = null; },
  async rollback() { if (this.saved) Object.assign(state, this.saved); this.saved = null; },
  release() {},
  async execute(sql, params) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.includes("SELECT DATE_FORMAT(NOW(), '%Y-%m-%d') AS today")) {
      return [[{ today: '2026-09-15' }]];
    }
    if (q.includes('DATE_FORMAT(last_chest_checkin_date')) {
      return [[{ chest_tickets: state.tickets, last_date: state.lastDate }]];
    }
    if (q === 'SELECT chest_tickets FROM users WHERE id = ? FOR UPDATE' ||
        q === 'SELECT chest_tickets FROM users WHERE id = ?') {
      return [[{ chest_tickets: state.tickets }]];
    }
    if (q === 'SELECT chest_tickets AS balance FROM users WHERE id = ? FOR UPDATE') {
      return [[{ balance: state.tickets }]];
    }
    if (q === 'UPDATE users SET chest_tickets = ? WHERE id = ?') {
      state.tickets = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q === 'UPDATE users SET last_chest_checkin_date = ? WHERE id = ?') {
      state.lastDate = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO account_ledger')) {
      state.ledger.push(params);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO operation_audit')) {
      state.audit.push(params);
      return [{ affectedRows: 1 }];
    }
    if (q === 'SELECT * FROM chest_configs WHERE id = ?') {
      return [[{ id: 1, price: 100 }]];
    }
    if (q.startsWith('SELECT * FROM chest_items WHERE chest_id')) {
      return [[{ item_name: 'test reward', weight: 1 }]];
    }
    if (q.startsWith('INSERT INTO user_chest_records')) {
      state.rewards.push(params);
      return [{ insertId: state.rewards.length }];
    }
    if (q.startsWith('INSERT INTO user_inventory')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected fake SQL: ${q}`);
  }
};
const fakePool = {
  getConnection: async () => conn,
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

test('daily checkin and chest open post separate ticket entries without replay', async (t) => {
  state.tickets = 0;
  state.lastDate = null;
  state.ledger = [];
  state.audit = [];
  state.rewards = [];
  const base = await serve(t);
  const token = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const headers = { Authorization: `Bearer ${token}` };
  const checkin = () => fetch(`${base}/api/chest/checkin`, { method: 'POST', headers });
  assert.equal((await checkin()).status, 200);
  assert.equal((await checkin()).status, 400);
  assert.equal(state.tickets, 1000);
  const originalRandom = Math.random;
  Math.random = () => 0;
  t.after(() => { Math.random = originalRandom; });
  const opened = await fetch(`${base}/api/chest/open`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ chestId: 1 })
  });
  assert.equal(opened.status, 200);
  assert.equal(state.tickets, 900);
  assert.equal(state.ledger.length, 2);
  assert.equal(state.ledger[0][3], 1000);
  assert.equal(state.ledger[1][3], -100);
  assert.equal(state.audit.length, 2);
  assert.equal(state.rewards.length, 1);
});
