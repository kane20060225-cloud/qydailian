'use strict';

const crypto = require('node:crypto');

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encodeBase32(bytes) {
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

function decodeBase32(secret) {
  if (typeof secret !== 'string' || !/^[A-Z2-7]{16,64}$/.test(secret)) {
    throw new Error('二次认证密钥格式无效');
  }
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of secret) {
    value = (value << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

function totpCode(secret, step) {
  if (!Number.isSafeInteger(step) || step < 0) throw new Error('二次认证时间步无效');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(number).padStart(6, '0');
}

function verifyTotpCode(secret, code, lastStep = -1, now = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code) ||
      !Number.isSafeInteger(lastStep) || !Number.isFinite(now)) return null;
  const currentStep = Math.floor(now / 30000);
  for (const step of [currentStep - 1, currentStep, currentStep + 1]) {
    if (step <= lastStep || step < 0) continue;
    const expected = Buffer.from(totpCode(secret, step));
    if (crypto.timingSafeEqual(Buffer.from(code), expected)) return step;
  }
  return null;
}

module.exports = { generateTotpSecret, totpCode, verifyTotpCode };
