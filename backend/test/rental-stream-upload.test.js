'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { saveRentalScreenshot, MAX_IMAGE_BYTES } = require('../lib/rental-stream-upload');

const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('synthetic')]);

async function tempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'b6-rental-upload-'));
  t.after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
  return dir;
}

test('raw PNG request is streamed to a validated final filename', async (t) => {
  const uploadDir = await tempDir(t);
  const filename = await saveRentalScreenshot({
    stream: Readable.from([png.subarray(0, 5), png.subarray(5)]),
    contentType: 'image/png', uploadDir, userId: 3
  });
  assert.match(filename, /^rental_3_[0-9]{16}\.png$/);
  assert.deepEqual(await fs.readFile(path.join(uploadDir, filename)), png);
  assert.equal((await fs.readdir(uploadDir)).some((name) => name.endsWith('.part')), false);
});

test('legacy Base64 JSON stays compatible but uses the same asynchronous validation', async (t) => {
  const uploadDir = await tempDir(t);
  const filename = await saveRentalScreenshot({
    contentType: 'application/json',
    body: { screenshot: `data:image/png;base64,${png.toString('base64')}` },
    uploadDir, userId: 4
  });
  assert.match(filename, /^rental_4_[0-9]{16}\.png$/);
  assert.deepEqual(await fs.readFile(path.join(uploadDir, filename)), png);
});

test('JPEG stream keeps a matching extension', async (t) => {
  const uploadDir = await tempDir(t);
  const jpeg = Buffer.from('ffd8ffe000104a4649460001', 'hex');
  const filename = await saveRentalScreenshot({
    stream: Readable.from([jpeg]), contentType: 'image/jpeg', uploadDir, userId: 5
  });
  assert.match(filename, /^rental_5_[0-9]{16}\.jpg$/);
  assert.deepEqual(await fs.readFile(path.join(uploadDir, filename)), jpeg);
});

test('invalid MIME, magic and oversized streams do not publish a file', async (t) => {
  const uploadDir = await tempDir(t);
  await assert.rejects(saveRentalScreenshot({
    stream: Readable.from([png]), contentType: 'text/html', uploadDir, userId: 3
  }), /只接受 PNG 或 JPEG/);
  await assert.rejects(saveRentalScreenshot({
    stream: Readable.from([Buffer.from('<html>unsafe</html>')]),
    contentType: 'image/png', uploadDir, userId: 3
  }), /图片格式无效/);
  await assert.rejects(saveRentalScreenshot({
    stream: Readable.from([png, Buffer.alloc(MAX_IMAGE_BYTES)]),
    contentType: 'image/png', uploadDir, userId: 3
  }), /大小不能超过/);
  assert.deepEqual(await fs.readdir(uploadDir), []);
});

test('invalid user ID and missing JSON screenshot fail before touching upload directory', async (t) => {
  const uploadDir = path.join(await tempDir(t), 'uncreated');
  await assert.rejects(saveRentalScreenshot({
    stream: Readable.from([png]), contentType: 'image/png', uploadDir, userId: 0
  }), /用户 ID 无效/);
  await assert.rejects(saveRentalScreenshot({
    contentType: 'application/json', body: {}, uploadDir, userId: 3
  }), /请提供截图/);
  await assert.rejects(fs.stat(uploadDir), { code: 'ENOENT' });
});
