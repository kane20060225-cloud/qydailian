'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } = require('../lib/recovery-codes');

test('creates unique high-entropy one-time recovery codes', () => {
  const codes = createRecoveryCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  for (const code of codes) {
    assert.match(code, /^([A-F0-9]{4}-){5}[A-F0-9]{4}$/);
    assert.match(hashRecoveryCode(code), /^[a-f0-9]{64}$/);
  }
});

test('normalizes input without accepting short or malformed recovery codes', () => {
  const code = createRecoveryCodes(1)[0];
  assert.equal(normalizeRecoveryCode(code.toLowerCase()), code.replace(/-/g, ''));
  assert.equal(hashRecoveryCode(code), hashRecoveryCode(code.replace(/-/g, '').toLowerCase()));
  assert.equal(hashRecoveryCode('123456'), null);
  assert.equal(hashRecoveryCode(null), null);
});
