'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { issueSessionToken } = require('../lib/auth-session');

process.env.JWT_SECRET = 'b6-rental-review-test-only';
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'test-user';
process.env.DB_PASSWORD = 'test-password';
process.env.DB_NAME = 'test-db';
process.env.ALIPAY_ENABLED = 'false';

const state = { accounts: [], audit: [], failAudit: false, listQueryCalls: 0 };
const conn = {
  saved: null,
  async beginTransaction() {
    this.saved = { accounts: structuredClone(state.accounts), audit: structuredClone(state.audit) };
  },
  async commit() { this.saved = null; },
  async rollback() {
    if (!this.saved) return;
    state.accounts = this.saved.accounts;
    state.audit = this.saved.audit;
    this.saved = null;
  },
  release() {},
  async execute(sql, params) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q === 'SELECT id, status FROM rental_accounts WHERE id = ? AND owner_id = ? FOR UPDATE') {
      return [state.accounts.filter((a) => a.id === params[0] && a.owner_id === params[1])];
    }
    if (q === 'SELECT id, status FROM rental_accounts WHERE id = ? FOR UPDATE') {
      return [state.accounts.filter((a) => a.id === params[0])];
    }
    if (q === 'UPDATE rental_accounts SET status = ? WHERE id = ? AND owner_id = ? AND status = ?') {
      const account = state.accounts.find((a) => a.id === params[1] &&
        a.owner_id === params[2] && a.status === params[3]);
      if (!account) return [{ affectedRows: 0 }];
      account.status = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q === 'UPDATE rental_accounts SET status = ? WHERE id = ? AND status = ?') {
      const account = state.accounts.find((a) => a.id === params[1] && a.status === params[2]);
      if (!account) return [{ affectedRows: 0 }];
      account.status = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO operation_audit')) {
      if (state.failAudit) throw new Error('audit unavailable');
      state.audit.push(params);
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected fake SQL: ${q}`);
  }
};
const pool = {
  async getConnection() { return conn; },
  async query(sql, params) {
    state.listQueryCalls++;
    return this.execute(sql, params);
  },
  async execute(sql, params) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q === 'SELECT token_version FROM users WHERE id = ?') {
      return [[{ token_version: 0 }]];
    }
    if (q === 'SELECT role FROM users WHERE id = ?') {
      return [[{ role: params[0] === 99 ? 'admin' : 'user' }]];
    }
    if (q.startsWith('SELECT COUNT(*) AS total FROM rental_accounts ra')) {
      return [[{ total: state.accounts.filter((a) => !params.length || a.status === params[0]).length }]];
    }
    if (q.startsWith('SELECT ra.id, ra.owner_id, ra.game_uid')) {
      const status = q.includes('WHERE ra.status = ?') ? params[0] : '';
      const limit = params.at(-2);
      const offset = params.at(-1);
      return [state.accounts.filter((a) => !status || a.status === status)
        .sort((a, b) => b.id - a.id).slice(offset, offset + limit)
        .map((a) => ({
          id: a.id, owner_id: a.owner_id, game_uid: a.game_uid,
          client_type: a.client_type, tank_list: a.tank_list,
          hourly_price: a.hourly_price, daily_price: a.daily_price,
          available_time_desc: a.available_time_desc, screenshots: a.screenshots,
          rules: a.rules, status: a.status, created_at: a.created_at,
          owner_name: `owner-${a.owner_id}`
        }))];
    }
    throw new Error(`Unexpected pool SQL: ${q}`);
  }
};
const originalCreatePool = mysql.createPool;
mysql.createPool = () => pool;
const { app } = require('../server');
mysql.createPool = originalCreatePool;

function reset() {
  state.accounts = [
    { id: 1, owner_id: 3, game_uid: 'uid-1', status: 'pending',
      password: 'fixture-secret-must-not-leak' },
    { id: 2, owner_id: 5, game_uid: 'uid-2', status: 'pending' }
  ];
  state.audit = [];
  state.failAudit = false;
  state.listQueryCalls = 0;
}
async function serve(t) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
function token(id) { return issueSessionToken(id, 0, process.env.JWT_SECRET); }
function put(base, path, actor, body) {
  return fetch(`${base}${path}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${token(actor)}`,
      'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
}

test('owner cannot self-approve pending or suspended rental account', async (t) => {
  reset();
  const base = await serve(t);
  const path = '/api/rental/accounts/1/status';
  assert.equal((await put(base, path, 3, { status: 'active' })).status, 400);
  assert.equal((await put(base, path, 3, { status: 'suspended' })).status, 409);
  assert.equal((await put(base, path, 5, { status: 'pending' })).status, 404);
  assert.equal(state.accounts[0].status, 'pending');
  assert.equal(state.audit.length, 0);
});

test('admin review uses strict boolean, locks state and audits once', async (t) => {
  reset();
  const base = await serve(t);
  const path = '/api/admin/rental/accounts/1/review';
  assert.equal((await put(base, path, 3, { approved: true })).status, 403);
  assert.equal((await put(base, path, 99, { approved: 'false' })).status, 400);
  assert.equal((await put(base, path, 99, { approved: true })).status, 200);
  assert.equal((await put(base, path, 99, { approved: true })).status, 409);
  assert.equal(state.accounts[0].status, 'active');
  assert.equal(state.audit.length, 1);
});

test('owner may suspend an approved account and request administrator re-review', async (t) => {
  reset();
  const base = await serve(t);
  const ownerPath = '/api/rental/accounts/1/status';
  const adminPath = '/api/admin/rental/accounts/1/review';
  assert.equal((await put(base, adminPath, 99, { approved: true })).status, 200);
  assert.equal((await put(base, ownerPath, 3, { status: 'suspended' })).status, 200);
  assert.equal((await put(base, ownerPath, 3, { status: 'active' })).status, 400);
  assert.equal((await put(base, ownerPath, 3, { status: 'pending' })).status, 200);
  assert.equal((await put(base, adminPath, 99, { approved: true })).status, 200);
  assert.equal(state.accounts[0].status, 'active');
  assert.equal(state.audit.length, 4);
});

test('admin rejection may be resubmitted, but audit failure rolls back status', async (t) => {
  reset();
  const base = await serve(t);
  const path = '/api/admin/rental/accounts/1/review';
  assert.equal((await put(base, path, 99, { approved: false })).status, 200);
  assert.equal(state.accounts[0].status, 'suspended');
  assert.equal((await put(base, '/api/rental/accounts/1/status', 3,
    { status: 'pending' })).status, 200);
  state.failAudit = true;
  assert.equal((await put(base, path, 99, { approved: true })).status, 500);
  assert.equal(state.accounts[0].status, 'pending');
  assert.equal(state.audit.length, 2);
});

test('admin account list is status-filtered, paged and private', async (t) => {
  reset();
  const base = await serve(t);
  assert.equal((await fetch(`${base}/api/admin/rental/accounts`)).status, 401);
  const response = await fetch(`${base}/api/admin/rental/accounts?status=pending&page=1`, {
    headers: { Authorization: `Bearer ${token(99)}` }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Total-Count'), '2');
  const rows = await response.json();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].password, undefined);
  assert.equal(state.listQueryCalls, 1);
  assert.equal((await put(base, '/api/admin/rental/accounts/1/review', 99, undefined)).status, 400);
  assert.equal((await fetch(`${base}/api/admin/rental/accounts?page=0`, {
    headers: { Authorization: `Bearer ${token(99)}` }
  })).status, 400);
});

test('admin rental account pagination returns the second page without duplicates', async (t) => {
  reset();
  state.accounts = Array.from({ length: 27 }, (_, index) => ({
    id: index + 1, owner_id: 3, game_uid: `uid-${index + 1}`, status: 'pending'
  }));
  const base = await serve(t);
  const headers = { Authorization: `Bearer ${token(99)}` };
  const first = await fetch(`${base}/api/admin/rental/accounts?status=pending&page=1`, { headers });
  const second = await fetch(`${base}/api/admin/rental/accounts?status=pending&page=2`, { headers });
  assert.equal(first.headers.get('X-Total-Count'), '27');
  assert.equal(second.headers.get('X-Total-Count'), '27');
  const firstRows = await first.json();
  const secondRows = await second.json();
  assert.equal(firstRows.length, 25);
  assert.equal(secondRows.length, 2);
  assert.equal(state.listQueryCalls, 2);
  assert.deepEqual(secondRows.map((row) => row.id), [2, 1]);
  assert.equal(firstRows.some((row) => secondRows.some((next) => next.id === row.id)), false);
});

test('mysql2 text query renders validated pagination as integer SQL literals', () => {
  assert.equal(mysql.format('SELECT id FROM rental_accounts WHERE status = ? LIMIT ? OFFSET ?',
    ['pending', 25, 25]),
  "SELECT id FROM rental_accounts WHERE status = 'pending' LIMIT 25 OFFSET 25");
});
