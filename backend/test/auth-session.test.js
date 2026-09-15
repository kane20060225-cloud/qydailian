'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const {
  createAuthMiddleware,
  issueSessionToken,
  verifySessionClaims,
  isCurrentSession
} = require('../lib/auth-session');

const SECRET = 'unit-test-only-session-secret';

test('issues a versioned JWT bound to a user', () => {
  const token = issueSessionToken(42, 3, SECRET);
  assert.deepEqual(
    (({ userId, tokenVersion }) => ({ userId, tokenVersion }))(verifySessionClaims(token, SECRET)),
    { userId: 42, tokenVersion: 3 }
  );
});

test('rejects legacy unversioned JWTs', () => {
  const legacyToken = jwt.sign({ userId: 42 }, SECRET);
  assert.throws(() => verifySessionClaims(legacyToken, SECRET), /声明无效/);
});

test('invalidates old tokens after a version increment', () => {
  const claims = verifySessionClaims(issueSessionToken(42, 3, SECRET), SECRET);
  assert.equal(isCurrentSession(claims, { token_version: 3 }), true);
  assert.equal(isCurrentSession(claims, { token_version: 4 }), false);
});

test('rejects malformed session parameters and signatures', () => {
  assert.throws(() => issueSessionToken(0, 0, SECRET), /参数无效/);
  assert.throws(() => issueSessionToken(42, -1, SECRET), /参数无效/);
  const token = issueSessionToken(42, 0, SECRET);
  assert.throws(() => verifySessionClaims(token, 'wrong-secret'));
});

function fakeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('middleware accepts only the current database token version', async () => {
  const token = issueSessionToken(42, 3, SECRET);
  const pool = { async execute() { return [[{ token_version: 3 }]]; } };
  const guard = createAuthMiddleware(pool, SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = fakeResponse();
  let advanced = false;

  await guard(req, res, () => { advanced = true; });
  assert.equal(advanced, true);
  assert.equal(req.userId, 42);
  assert.equal(req.tokenVersion, 3);
});

test('middleware rejects a revoked token before entering a business route', async () => {
  const token = issueSessionToken(42, 3, SECRET);
  const pool = { async execute() { return [[{ token_version: 4 }]]; } };
  const guard = createAuthMiddleware(pool, SECRET);
  const res = fakeResponse();
  let advanced = false;

  await guard({ headers: { authorization: `Bearer ${token}` } }, res, () => { advanced = true; });
  assert.equal(advanced, false);
  assert.equal(res.statusCode, 401);
});

test('middleware fails closed when the database cannot verify a session', async () => {
  const token = issueSessionToken(42, 3, SECRET);
  const pool = { async execute() { throw new Error('db offline'); } };
  const guard = createAuthMiddleware(pool, SECRET);
  const res = fakeResponse();
  let advanced = false;

  await guard({ headers: { authorization: `Bearer ${token}` } }, res, () => { advanced = true; });
  assert.equal(advanced, false);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, '暂时无法验证登录状态');
});
