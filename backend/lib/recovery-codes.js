'use strict';

const crypto = require('node:crypto');

function normalizeRecoveryCode(code) {
  if (typeof code !== 'string') return null;
  const normalized = code.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-F0-9]{24}$/.test(normalized) ? normalized : null;
}

function hashRecoveryCode(code) {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized, 'ascii').digest('hex');
}

function createRecoveryCodes(count = 8) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 20) {
    throw new Error('恢复码数量无效');
  }
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(12).toString('hex').toUpperCase();
    return raw.match(/.{4}/g).join('-');
  });
}

module.exports = { normalizeRecoveryCode, hashRecoveryCode, createRecoveryCodes };
