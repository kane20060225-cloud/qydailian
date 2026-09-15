'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { issueSessionToken } = require('../lib/auth-session');

process.env.JWT_SECRET = 'http-test-only-jwt-secret';
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'test-user';
process.env.DB_PASSWORD = 'test-password';
process.env.DB_NAME = 'test-db';
process.env.ALIPAY_ENABLED = 'false';

const state = {
  userId: 42,
  tokenVersion: 0,
  passwordHash: null
};

const fakePool = {
  async execute(sql, params) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized === 'SELECT token_version FROM users WHERE id = ?') {
      return [[{ token_version: state.tokenVersion }]];
    }
    if (normalized.startsWith('UPDATE users SET token_version = token_version + 1')) {
      if (params[0] !== state.userId || params[1] !== state.tokenVersion) {
        return [{ affectedRows: 0 }];
      }
      state.tokenVersion += 1;
      return [{ affectedRows: 1 }];
    }
    if (normalized === 'SELECT password_hash, token_version FROM users WHERE id = ?') {
      return [[{ password_hash: state.passwordHash, token_version: state.tokenVersion }]];
    }
    if (normalized.startsWith('UPDATE users SET password_hash = ?')) {
      if (params[1] !== state.userId || params[2] !== state.passwordHash ||
          params[3] !== state.tokenVersion) {
        return [{ affectedRows: 0 }];
      }
      state.passwordHash = params[0];
      state.tokenVersion += 1;
      return [{ affectedRows: 1 }];
    }
    if (normalized.startsWith('SELECT id, username, email, phone, balance')) {
      return [[{ id: state.userId, username: 'test-user' }]];
    }
    if (normalized.startsWith('SELECT user_id, theme, language, notify_order_update')) {
      return [[{
        user_id: state.userId,
        theme: 'dark',
        two_factor_enabled: 0
      }]];
    }
    throw new Error(`Unexpected fake SQL: ${normalized}`);
  }
};

const originalCreatePool = mysql.createPool;
mysql.createPool = () => fakePool;
const { app } = require('../server');
mysql.createPool = originalCreatePool;

async function serve(t) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('logout revokes the current JWT on subsequent authenticated requests', async (t) => {
  state.tokenVersion = 0;
  const base = await serve(t);
  const token = issueSessionToken(state.userId, 0, process.env.JWT_SECRET);
  const headers = { Authorization: `Bearer ${token}` };

  const before = await fetch(`${base}/api/user/profile`, { headers });
  assert.equal(before.status, 200);

  const logout = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers });
  assert.equal(logout.status, 200);
  assert.equal(state.tokenVersion, 1);

  const after = await fetch(`${base}/api/user/profile`, { headers });
  assert.equal(after.status, 401);
});

test('password change invalidates the old JWT and returns a usable new JWT', async (t) => {
  state.tokenVersion = 0;
  state.passwordHash = await bcrypt.hash('old-test-password', 4);
  const base = await serve(t);
  const oldToken = issueSessionToken(state.userId, 0, process.env.JWT_SECRET);

  const change = await fetch(`${base}/api/user/change-password`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${oldToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      oldPassword: 'old-test-password',
      newPassword: 'new-test-password'
    })
  });
  assert.equal(change.status, 200);
  const changed = await change.json();
  assert.equal(state.tokenVersion, 1);
  assert.equal(await bcrypt.compare('new-test-password', state.passwordHash), true);
  assert.equal(typeof changed.token, 'string');

  const oldResponse = await fetch(`${base}/api/user/profile`, {
    headers: { Authorization: `Bearer ${oldToken}` }
  });
  assert.equal(oldResponse.status, 401);

  const newResponse = await fetch(`${base}/api/user/profile`, {
    headers: { Authorization: `Bearer ${changed.token}` }
  });
  assert.equal(newResponse.status, 200);
});

test('settings response excludes the unused 2FA secret and rejects fake enablement', async (t) => {
  state.tokenVersion = 0;
  const base = await serve(t);
  const token = issueSessionToken(state.userId, 0, process.env.JWT_SECRET);
  const headers = { Authorization: `Bearer ${token}` };

  const settings = await fetch(`${base}/api/user/settings`, { headers });
  assert.equal(settings.status, 200);
  const body = await settings.json();
  assert.equal(Object.hasOwn(body, 'two_factor_secret'), false);

  const enable = await fetch(`${base}/api/user/settings`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ two_factor_enabled: 1 })
  });
  assert.equal(enable.status, 400);
});
