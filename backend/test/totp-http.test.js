'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const { issueSessionToken } = require('../lib/auth-session');
const { totpCode } = require('../lib/totp');
const { createFieldCipher } = require('../lib/field-encryption');
const { createRecoveryCodes, hashRecoveryCode } = require('../lib/recovery-codes');

process.env.JWT_SECRET = 'totp-http-test-only-jwt';
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'test-user';
process.env.DB_PASSWORD = 'test-password';
process.env.DB_NAME = 'test-db';
process.env.ALIPAY_ENABLED = 'false';

const state = {
  userId: 47,
  tokenVersion: 0,
  passwordHash: null,
  enabled: 0,
  encryptedSecret: null,
  lastStep: -1,
  codes: new Map()
};

const fakePool = {
  async execute(sql, params = []) {
    const query = sql.replace(/\s+/g, ' ').trim();
    if (query === 'SELECT token_version FROM users WHERE id = ?') {
      return [[{ token_version: state.tokenVersion }]];
    }
    if (query === 'SELECT password_hash FROM users WHERE id = ?') {
      return [[{ password_hash: state.passwordHash }]];
    }
    if (query === 'SELECT two_factor_enabled FROM user_settings WHERE user_id = ?') {
      return [[{ two_factor_enabled: state.enabled }]];
    }
    if (query === 'SELECT two_factor_enabled, two_factor_secret, two_factor_last_step FROM user_settings WHERE user_id = ?') {
      return [[{
        two_factor_enabled: state.enabled,
        two_factor_secret: state.encryptedSecret,
        two_factor_last_step: state.lastStep
      }]];
    }
    if (query.startsWith('SELECT id, username, password_hash, token_version')) {
      return [[{
        id: state.userId,
        username: 'test-user',
        password_hash: state.passwordHash,
        token_version: state.tokenVersion,
        role: 'user'
      }]];
    }
    if (query.startsWith('SELECT user_id, theme, language, notify_order_update')) {
      return [[{ user_id: state.userId, theme: 'dark', two_factor_enabled: state.enabled }]];
    }
    if (query.startsWith('UPDATE user_settings SET two_factor_enabled = 1')) {
      if (state.enabled) return [{ affectedRows: 0 }];
      state.encryptedSecret = params[0];
      state.lastStep = params[1];
      state.enabled = 1;
      return [{ affectedRows: 1 }];
    }
    if (query.startsWith('UPDATE user_settings SET two_factor_last_step = ?')) {
      if (!state.enabled || params[1] !== state.userId || state.lastStep >= params[2]) {
        return [{ affectedRows: 0 }];
      }
      state.lastStep = params[0];
      return [{ affectedRows: 1 }];
    }
    if (query.startsWith('UPDATE user_settings SET two_factor_enabled = 0')) {
      if (!state.enabled || (params.length > 1 && state.lastStep >= params[1])) return [{ affectedRows: 0 }];
      state.enabled = 0;
      state.encryptedSecret = null;
      state.lastStep = -1;
      return [{ affectedRows: 1 }];
    }
    if (query === 'INSERT INTO user_two_factor_recovery_codes (user_id, code_hash) VALUES (?, ?)') {
      state.codes.set(params[1], true);
      return [{ affectedRows: 1 }];
    }
    if (query.startsWith('UPDATE user_two_factor_recovery_codes SET active = 0, used_at')) {
      if (!state.codes.get(params[1])) return [{ affectedRows: 0 }];
      state.codes.set(params[1], false);
      return [{ affectedRows: 1 }];
    }
    if (query === 'UPDATE user_two_factor_recovery_codes SET active = 0 WHERE user_id = ? AND active = 1') {
      for (const key of state.codes.keys()) state.codes.set(key, false);
      return [{ affectedRows: 8 }];
    }
    if (query === 'UPDATE users SET token_version = token_version + 1 WHERE id = ? AND token_version = ?') {
      if (params[0] !== state.userId || params[1] !== state.tokenVersion) return [{ affectedRows: 0 }];
      state.tokenVersion += 1;
      return [{ affectedRows: 1 }];
    }
    if (query.startsWith('INSERT INTO login_devices') || query.startsWith('INSERT IGNORE INTO user_settings')) {
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected fake SQL: ${query}`);
  },
  async getConnection() {
    let snapshot;
    return {
      execute: this.execute.bind(this),
      async beginTransaction() { snapshot = { ...state, codes: new Map(state.codes) }; },
      async rollback() { if (snapshot) Object.assign(state, snapshot); },
      async commit() { snapshot = null; },
      release() {}
    };
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

test('TOTP binding, login replay protection and password-protected disabling', async (t) => {
  const originalNow = Date.now;
  Date.now = () => 1700000000000;
  t.after(() => { Date.now = originalNow; });
  state.passwordHash = await bcrypt.hash('local-test-password', 4);
  state.enabled = 0;
  state.encryptedSecret = null;
  state.lastStep = -1;
  state.codes = new Map();
  const base = await serve(t);
  const currentStep = Math.floor(Date.now() / 30000);
  const token = issueSessionToken(state.userId, state.tokenVersion, process.env.JWT_SECRET);
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const post = (route, body, headers = authHeaders) => fetch(`${base}${route}`, {
    method: 'POST', headers, body: JSON.stringify(body)
  });

  const invalidSetup = await post('/api/auth/two-factor/setup', { password: 'incorrect' });
  assert.equal(invalidSetup.status, 401);
  const setup = await post('/api/auth/two-factor/setup', { password: 'local-test-password' });
  assert.equal(setup.status, 200);
  const { secret, setupToken } = await setup.json();
  const setupTokenAsSession = await fetch(`${base}/api/user/settings`, {
    headers: { Authorization: `Bearer ${setupToken}` }
  });
  assert.equal(setupTokenAsSession.status, 401);

  const badConfirm = await post('/api/auth/two-factor/confirm', { setupToken, code: 'x' });
  assert.equal(badConfirm.status, 400);
  const confirm = await post('/api/auth/two-factor/confirm', {
    setupToken,
    code: totpCode(secret, currentStep - 1)
  });
  assert.equal(confirm.status, 200);
  const confirmed = await confirm.json();
  assert.equal(confirmed.recoveryCodes.length, 8);
  assert.equal(state.codes.size, 8);
  assert.equal(state.tokenVersion, 1);
  const oldSession = await fetch(`${base}/api/user/settings`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(oldSession.status, 401);
  authHeaders.Authorization = `Bearer ${confirmed.token}`;
  assert.equal(state.enabled, 1);
  assert.notEqual(state.encryptedSecret, secret);

  const settings = await fetch(`${base}/api/user/settings`, { headers: authHeaders });
  const settingsBody = await settings.json();
  assert.equal(settingsBody.two_factor_enabled, 1);
  assert.equal(Object.hasOwn(settingsBody, 'two_factor_secret'), false);

  const loginHeaders = { 'Content-Type': 'application/json' };
  const loginBody = { username: 'test-user', password: 'local-test-password' };
  const missingCode = await post('/api/auth/login', loginBody, loginHeaders);
  assert.equal(missingCode.status, 401);
  assert.equal((await missingCode.json()).requiresTwoFactor, true);
  const login = await post('/api/auth/login', {
    ...loginBody, twoFactorCode: totpCode(secret, currentStep)
  }, loginHeaders);
  assert.equal(login.status, 200);
  const loginData = await login.json();
  assert.equal(typeof loginData.token, 'string');

  const replay = await post('/api/auth/login', {
    ...loginBody, twoFactorCode: totpCode(secret, currentStep)
  }, loginHeaders);
  assert.equal(replay.status, 401);

  const badDisable = await post('/api/auth/two-factor/disable', {
    password: 'incorrect', code: totpCode(secret, currentStep + 1)
  });
  assert.equal(badDisable.status, 401);
  const disable = await post('/api/auth/two-factor/disable', {
    password: 'local-test-password', code: totpCode(secret, currentStep + 1)
  });
  assert.equal(disable.status, 200);
  const disabled = await disable.json();
  assert.equal(state.tokenVersion, 2);
  const oldFactorSession = await fetch(`${base}/api/user/settings`, { headers: authHeaders });
  assert.equal(oldFactorSession.status, 401);
  authHeaders.Authorization = `Bearer ${disabled.token}`;
  const newSession = await fetch(`${base}/api/user/settings`, { headers: authHeaders });
  assert.equal(newSession.status, 200);
  assert.equal(state.enabled, 0);
  assert.equal(state.encryptedSecret, null);
  assert.equal([...state.codes.values()].every((active) => !active), true);
});

test('one-time recovery login and recovery-assisted disabling revoke old sessions', async (t) => {
  state.passwordHash = await bcrypt.hash('recover-local-password', 4);
  state.enabled = 1;
  state.lastStep = -1;
  const cipher = createFieldCipher(process.env.DATA_ENCRYPTION_KEY);
  state.encryptedSecret = cipher.encrypt('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'user_settings.two_factor_secret');
  const codes = createRecoveryCodes(2);
  state.codes = new Map(codes.map((code) => [hashRecoveryCode(code), true]));
  const base = await serve(t);
  const oldToken = issueSessionToken(state.userId, state.tokenVersion, process.env.JWT_SECRET);
  const login = (recoveryCode) => fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-user', password: 'recover-local-password', recoveryCode })
  });
  const recovered = await login(codes[0]);
  assert.equal(recovered.status, 200);
  const recoveredToken = (await recovered.json()).token;
  assert.equal(state.codes.get(hashRecoveryCode(codes[0])), false);
  const oldSession = await fetch(`${base}/api/user/settings`, {
    headers: { Authorization: `Bearer ${oldToken}` }
  });
  assert.equal(oldSession.status, 401);
  assert.equal((await login(codes[0])).status, 401);

  const disable = await fetch(`${base}/api/auth/two-factor/disable`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${recoveredToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'recover-local-password', recoveryCode: codes[1] })
  });
  assert.equal(disable.status, 200);
  assert.equal(state.enabled, 0);
  assert.equal([...state.codes.values()].every((active) => !active), true);
  const after = await fetch(`${base}/api/user/settings`, {
    headers: { Authorization: `Bearer ${recoveredToken}` }
  });
  assert.equal(after.status, 401);
});

test('login throttles repeated invalid passwords for one IP and username', async (t) => {
  state.enabled = 0;
  state.passwordHash = await bcrypt.hash('correct-local-password', 4);
  const base = await serve(t);
  const request = () => fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'rate-limit-test-user', password: 'incorrect' })
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await request()).status, 401);
  }
  assert.equal((await request()).status, 429);
  const forwardedClient = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.42' },
    body: JSON.stringify({ username: 'rate-limit-test-user', password: 'incorrect' })
  });
  assert.equal(forwardedClient.status, 401);
});
