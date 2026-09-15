'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateTotpSecret, totpCode, verifyTotpCode } = require('../lib/totp');

test('TOTP follows the RFC 6238 SHA-1 six-digit test vector', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totpCode(secret, 1), '287082');
  assert.equal(verifyTotpCode(secret, '287082', -1, 59000), 1);
});

test('new TOTP secrets are random and use valid base32', () => {
  const first = generateTotpSecret();
  const second = generateTotpSecret();
  assert.match(first, /^[A-Z2-7]{32}$/);
  assert.notEqual(first, second);
  assert.match(totpCode(first, 1), /^\d{6}$/);
});

test('TOTP rejects malformed and replayed codes', () => {
  const secret = generateTotpSecret();
  const now = 1700000000000;
  const step = Math.floor(now / 30000);
  const code = totpCode(secret, step);
  assert.equal(verifyTotpCode(secret, code, step - 1, now), step);
  assert.equal(verifyTotpCode(secret, code, step, now), null);
  assert.equal(verifyTotpCode(secret, '12345', -1, now), null);
  assert.equal(verifyTotpCode(secret, 123456, -1, now), null);
});
