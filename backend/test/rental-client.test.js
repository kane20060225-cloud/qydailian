'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRentalClient, screenshotNames, accountStatusLabels, RentalApiError } =
  require('../../public/rental-client.js');

function response(data, { status = 200, total = null } = {}) {
  return { ok: status >= 200 && status < 300, status,
    headers: { get(name) { return name === 'X-Total-Count' ? total : null; } },
    async json() { return data; } };
}

test('rental screenshot names accept JSON arrays or strings but no unsafe path', () => {
  const names = ['rental_3_1234567890123.png', '../private.pem',
    'rental_4_1234567890124.jpg', '<script>', 'rental_5_1234567890125.jpeg'];
  assert.deepEqual(screenshotNames(names), [names[0], names[2], names[4]]);
  assert.deepEqual(screenshotNames(JSON.stringify(names)), [names[0], names[2], names[4]]);
  assert.deepEqual(screenshotNames('{bad json'), []);
  assert.equal(accountStatusLabels.pending, '待审核');
});

test('public rental hall cache deduplicates requests, expires and invalidates', async () => {
  let clock = 1000;
  let requests = 0;
  const client = createRentalClient({ now: () => clock, ttlMs: 5000,
    fetchImpl: async () => { requests++; return response([{ id: requests }]); } });
  const [first, concurrent] = await Promise.all([client.getHall(), client.getHall()]);
  assert.deepEqual(first, concurrent);
  assert.equal(requests, 1);
  assert.equal((await client.getHall())[0].id, 1);
  clock += 5001;
  assert.equal((await client.getHall())[0].id, 2);
  client.invalidateHall();
  assert.equal((await client.getHall())[0].id, 3);
  assert.equal(requests, 3);
});

test('forced hall refresh never lets an older in-flight response replace new cache', async () => {
  const pending = [];
  const client = createRentalClient({ fetchImpl: () => new Promise((resolve) => pending.push(resolve)) });
  const older = client.getHall();
  const newer = client.getHall({ force: true });
  pending[1](response([{ id: 2 }]));
  assert.equal((await newer)[0].id, 2);
  pending[0](response([{ id: 1 }]));
  assert.equal((await older)[0].id, 1);
  assert.equal((await client.getHall())[0].id, 2);
  assert.equal(pending.length, 2);
});

test('admin list uses one API client with filter, page, auth and total header', async () => {
  const calls = [];
  const client = createRentalClient({ getToken: () => 'synthetic-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response([{ id: 4 }], { total: '26' });
    } });
  const result = await client.getAdminAccounts({ status: 'pending', page: 2 });
  assert.equal(result.total, 26);
  assert.equal(result.accounts[0].id, 4);
  assert.equal(calls[0].url, '/api/admin/rental/accounts?page=2&status=pending');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-token');
  await assert.rejects(client.getAdminAccounts({ status: 'bad', page: 1 }), /状态无效/);
  await assert.rejects(client.getAdminAccounts({ status: 'pending', page: 0 }), /页码无效/);
});

test('review validates boolean and invalidates the public hall cache', async () => {
  const calls = [];
  const client = createRentalClient({ getToken: () => 'synthetic-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(url.includes('/admin/') ? { success: true } : [{ id: 1 }]);
    } });
  await client.getHall();
  await assert.rejects(client.reviewAccount(1, 'false'), /审核参数无效/);
  await client.reviewAccount(1, true);
  await client.getHall();
  assert.equal(calls.filter((call) => call.url === '/api/rental/accounts').length, 2);
  const review = calls.find((call) => call.url.endsWith('/1/review'));
  assert.equal(review.options.method, 'PUT');
  assert.deepEqual(JSON.parse(review.options.body), { approved: true });
});

test('archive and deleted-list requests use authenticated recoverable actions', async () => {
  const calls = [];
  const client = createRentalClient({ getToken: () => 'synthetic-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response(url.includes('my-accounts') ? [] : { success: true, message: 'ok' });
    } });
  await client.getMyAccounts({ deleted: true });
  await client.changeAccountArchive(7, 'archive');
  await client.changeAccountArchive(7, 'restore', { admin: true });
  assert.equal(calls[0].url, '/api/rental/my-accounts?deleted=1');
  assert.equal(calls[1].url, '/api/rental/accounts/7/archive');
  assert.equal(calls[2].url, '/api/admin/rental/accounts/7/restore');
  assert.equal(calls[1].options.method, 'POST');
  await assert.rejects(client.changeAccountArchive(7, 'remove'), /操作无效/);
});

test('API client surfaces server errors without treating failed JSON as account data', async () => {
  const client = createRentalClient({ fetchImpl: async () =>
    response({ error: '服务器错误' }, { status: 500 }) });
  await assert.rejects(client.getHall(), /服务器错误/);
});

test('API errors expose status and retryability without losing the server message', async () => {
  const client = createRentalClient({ fetchImpl: async () =>
    response({ error: '稍后再试', code: 'TEMPORARY' }, { status: 503 }) });
  await assert.rejects(client.getHall(), error => {
    assert.equal(error instanceof RentalApiError, true);
    assert.equal(error.status, 503);
    assert.equal(error.retryable, true);
    assert.equal(error.code, 'TEMPORARY');
    assert.equal(error.message, '稍后再试');
    return true;
  });
});

test('authenticated rental requests report an expired session to the shared UI handler', async () => {
  let expired = 0;
  const client = createRentalClient({ getToken: () => 'expired-token',
    onUnauthorized: () => expired++, fetchImpl: async () =>
      response({ error: '登录已过期' }, { status: 401 }) });
  await assert.rejects(client.getMyAccounts(), /登录已过期/);
  assert.equal(expired, 1);
});

test('new rental screenshots upload as a raw image body with client-side size checks', async () => {
  const calls = [];
  const file = new Blob([Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.from('synthetic')])], { type: 'image/png' });
  const client = createRentalClient({ getToken: () => 'synthetic-token',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return response({ filename: 'rental_3_1234567890123.png' });
    } });
  assert.equal(await client.uploadScreenshot(file), 'rental_3_1234567890123.png');
  assert.equal(calls[0].url, '/api/rental/upload-screenshot');
  assert.equal(calls[0].options.headers['Content-Type'], 'image/png');
  assert.equal(calls[0].options.body, file);
  await assert.rejects(client.uploadScreenshot(new Blob(['bad'], { type: 'text/plain' })),
    /只接受 PNG 或 JPEG/);
  await assert.rejects(client.uploadScreenshot(new Blob(['tiny'], { type: 'image/png' })),
    /8 字节到 5MB/);
});

test('screenshot uploader reports progress and keeps a retryable file reference', async () => {
  const progress = [];
  const file = new Blob([Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'),
    Buffer.from('progress')])], { type: 'image/png' });
  const client = createRentalClient({ getToken: () => 'synthetic-token',
    fetchImpl: async () => { throw new Error('progress upload should use uploadImpl'); },
    uploadImpl: async (url, options) => {
      assert.equal(url, '/api/rental/upload-screenshot');
      assert.equal(options.body, file);
      options.onProgress(35);
      options.onProgress(80);
      return response({ filename: 'rental_3_1234567890123.png' });
    } });
  assert.equal(await client.uploadScreenshot(file, { onProgress: value => progress.push(value) }),
    'rental_3_1234567890123.png');
  assert.deepEqual(progress, [35, 80, 100]);
});
