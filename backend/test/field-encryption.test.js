'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFieldCipher, isEncryptedValue } = require('../lib/field-encryption');

const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

test('encrypts and decrypts a sensitive field', () => {
  const cipher = createFieldCipher(TEST_KEY);
  const encrypted = cipher.encrypt('sensitive-value', 'orders.game_password');

  assert.equal(isEncryptedValue(encrypted), true);
  assert.notEqual(encrypted, 'sensitive-value');
  assert.equal(cipher.decrypt(encrypted, 'orders.game_password'), 'sensitive-value');
});

test('uses a fresh IV for every encryption', () => {
  const cipher = createFieldCipher(TEST_KEY);
  const first = cipher.encrypt('same-value', 'orders.game_account');
  const second = cipher.encrypt('same-value', 'orders.game_account');

  assert.notEqual(first, second);
});

test('binds ciphertext to its field context', () => {
  const cipher = createFieldCipher(TEST_KEY);
  const encrypted = cipher.encrypt('sensitive-value', 'orders.game_password');

  assert.throws(() => cipher.decrypt(encrypted, 'orders.game_account'));
});

test('supports legacy plaintext during a controlled migration', () => {
  const cipher = createFieldCipher(TEST_KEY);

  assert.equal(cipher.decrypt('legacy-plaintext', 'orders.game_password'), 'legacy-plaintext');
  assert.equal(cipher.encrypt(null, 'orders.game_password'), null);
});

test('rejects an invalid encryption key', () => {
  assert.throws(() => createFieldCipher('not-a-32-byte-key'));
});
