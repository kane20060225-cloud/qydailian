'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

function validateRentalPaymentEvidence(uploadDir, filename, userId) {
  if (typeof filename !== 'string' ||
      !new RegExp(`^rental_${Number(userId)}_[0-9]{10,16}\\.png$`).test(filename) ||
      path.basename(filename) !== filename) {
    throw new Error('付款截图文件名无效或不属于当前用户');
  }
  const filePath = path.join(uploadDir, filename);
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.size < 8 || stat.size > MAX_EVIDENCE_BYTES) {
    throw new Error('付款截图大小或类型无效');
  }
  const handle = fs.openSync(filePath, 'r');
  const head = Buffer.alloc(12);
  try { fs.readSync(handle, head, 0, head.length, 0); }
  finally { fs.closeSync(handle); }
  const png = head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (!png && !jpeg) throw new Error('付款截图必须是 PNG 或 JPEG 图片');
  return filePath;
}

module.exports = { MAX_EVIDENCE_BYTES, validateRentalPaymentEvidence };
