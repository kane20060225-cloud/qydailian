'use strict';

const crypto = require('crypto');

const ENCRYPTED_VALUE_PREFIX = 'enc:v1';
const IV_LENGTH_BYTES = 12;

function parseEncryptionKey(encodedKey) {
  if (!encodedKey) {
    throw new Error('缺少必要环境变量: DATA_ENCRYPTION_KEY');
  }

  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encodedKey) {
    throw new Error('DATA_ENCRYPTION_KEY 必须是 32 字节密钥的标准 Base64 编码');
  }

  return key;
}

function isEncryptedValue(value) {
  return typeof value === 'string' && value.startsWith(`${ENCRYPTED_VALUE_PREFIX}:`);
}

function createFieldCipher(encodedKey) {
  const key = parseEncryptionKey(encodedKey);

  function encrypt(value, context) {
    if (value === null || value === undefined || value === '') return null;
    if (isEncryptedValue(value)) return value;

    const iv = crypto.randomBytes(IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));

    const encrypted = Buffer.concat([
      cipher.update(String(value), 'utf8'),
      cipher.final()
    ]);

    return [
      ENCRYPTED_VALUE_PREFIX,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64')
    ].join(':');
  }

  function decrypt(value, context) {
    if (value === null || value === undefined || value === '') return null;
    if (!isEncryptedValue(value)) return value;

    const parts = value.split(':');
    if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== ENCRYPTED_VALUE_PREFIX) {
      throw new Error('加密字段格式无效');
    }

    const iv = Buffer.from(parts[2], 'base64');
    const authTag = Buffer.from(parts[3], 'base64');
    const ciphertext = Buffer.from(parts[4], 'base64');
    if (iv.length !== IV_LENGTH_BYTES || authTag.length !== 16) {
      throw new Error('加密字段格式无效');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]).toString('utf8');
  }

  return { encrypt, decrypt, isEncryptedValue };
}

module.exports = {
  ENCRYPTED_VALUE_PREFIX,
  createFieldCipher,
  isEncryptedValue
};
