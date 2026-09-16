'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Transform, Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function imageExtension(contentType) {
  const normalized = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/jpeg') return 'jpg';
  throw new Error('只接受 PNG 或 JPEG 图片');
}

function bufferFromLegacyBody(body) {
  const value = body?.screenshot;
  if (typeof value !== 'string') throw new Error('请提供截图');
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/i.exec(value);
  if (!match) throw new Error('截图数据格式无效');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('截图大小不能超过 5MB');
  }
  return { stream: Readable.from([buffer]), contentType: match[1] };
}

function hasImageMagic(head, extension) {
  if (extension === 'png') {
    return head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  }
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

async function saveRentalScreenshot({ stream, body, contentType, uploadDir, userId }) {
  const numericUserId = Number(userId);
  if (!Number.isSafeInteger(numericUserId) || numericUserId <= 0) {
    throw new Error('用户 ID 无效');
  }
  let source = stream;
  let type = contentType;
  if (String(contentType || '').toLowerCase().startsWith('application/json')) {
    const legacy = bufferFromLegacyBody(body);
    source = legacy.stream;
    type = legacy.contentType;
  }
  const extension = imageExtension(type);
  if (!source || typeof source.pipe !== 'function') throw new Error('请提供截图');

  const stamp = String(Date.now()).padStart(13, '0') + crypto.randomInt(100, 1000);
  const filename = `rental_${numericUserId}_${stamp}.${extension}`;
  await fsp.mkdir(uploadDir, { recursive: true });
  const tempPath = path.join(uploadDir, `.${filename}.${crypto.randomUUID()}.part`);
  const finalPath = path.join(uploadDir, filename);
  let total = 0;
  const chunks = [];
  let headBytes = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      total += chunk.length;
      if (total > MAX_IMAGE_BYTES) return callback(new Error('截图大小不能超过 5MB'));
      if (headBytes < 12) {
        const part = chunk.subarray(0, 12 - headBytes);
        chunks.push(part);
        headBytes += part.length;
      }
      callback(null, chunk);
    }
  });
  try {
    await pipeline(source, limiter, fs.createWriteStream(tempPath, { flags: 'wx' }));
    if (total < 8 || !hasImageMagic(Buffer.concat(chunks).subarray(0, 12), extension)) {
      throw new Error('图片格式无效');
    }
    await fsp.rename(tempPath, finalPath);
    return filename;
  } catch (err) {
    await fsp.rm(tempPath, { force: true });
    throw err;
  }
}

module.exports = { MAX_IMAGE_BYTES, saveRentalScreenshot };
