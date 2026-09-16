'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRentalClient, screenshotNames, accountStatusLabels } =
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

test('API client surfaces server errors without treating failed JSON as account data', async () => {
  const client = createRentalClient({ fetchImpl: async () =>
    response({ error: '服务器错误' }, { status: 500 }) });
  await assert.rejects(client.getHall(), /服务器错误/);
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
