'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

Object.assign(process.env, {
  JWT_SECRET: 'pwa-http-test-only', DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  DB_HOST: '127.0.0.1', DB_USER: 'test-user', DB_PASSWORD: 'test-password',
  DB_NAME: 'test-database', ALIPAY_ENABLED: 'false'
});
const { app } = require('../server');
const publicDir = path.resolve(__dirname, '../../public');

test('Express exposes the root-scope PWA with valid metadata, icons and no missing static paths', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin + '/manifest.webmanifest');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/manifest\+json/);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  const manifest = await response.json();
  assert.equal(manifest.short_name, 'QY Blitz');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'zh-CN');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  for (const icon of manifest.icons) {
    const res = await fetch(origin + icon.src);
    assert.equal(res.status, 200, icon.src);
    assert.match(res.headers.get('content-type'), /image\/png/);
    const png = Buffer.from(await res.arrayBuffer());
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  const apple = await fetch(origin + '/apple-touch-icon.png');
  const applePng = Buffer.from(await apple.arrayBuffer());
  assert.equal(apple.status, 200);
  assert.equal(applePng.readUInt32BE(16), 180);
  const worker = await fetch(origin + '/service-worker.js');
  assert.equal(worker.status, 200);
  assert.match(worker.headers.get('content-type'), /javascript/);
  assert.equal(worker.headers.get('cache-control'), 'no-store');
  assert.equal(worker.headers.get('service-worker-allowed'), '/');
  const workerSource = await worker.text();
  // All explicit cache paths must resolve to real static resources, never a 404 HTML page.
  const staticList = workerSource.match(/const STATIC_PATHS = new Set\(\[([\s\S]*?)\]\)/)[1];
  for (const match of staticList.matchAll(/'([^']+)'/g)) {
    const asset = await fetch(origin + match[1]);
    assert.equal(asset.status, 200, match[1]);
    assert.doesNotMatch(asset.headers.get('content-type'), /text\/html/, match[1]);
    await asset.arrayBuffer();
  }
  for (const route of ['/', '/index.html', '/offline.html']) {
    const document = await fetch(origin + route);
    assert.equal(document.status, 200);
    const html = await document.text();
    for (const name of ['viewport', 'theme-color', 'apple-mobile-web-app-capable', 'apple-mobile-web-app-title', 'apple-mobile-web-app-status-bar-style']) {
      assert.equal((html.match(new RegExp(`name="${name}"`, 'g')) || []).length, 1, `${route}: ${name}`);
    }
    assert.equal((html.match(/rel="manifest"/g) || []).length, 1);
    assert.equal((html.match(/rel="apple-touch-icon"/g) || []).length, 1);
    if (route !== '/offline.html') {
      for (const id of ['pwaInstallArea', 'pwaInstallButton', 'pwaInstallGuide', 'pwaGuideSteps']) {
        assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${route}: ${id}`);
      }
    }
  }
  const source = fs.readFileSync(path.join(publicDir, 'pwa.js'), 'utf8');
  assert.equal((source.match(/serviceWorker\.register\(/g) || []).length, 1);
  assert.equal((await fetch(origin + '/api/user/profile')).status, 401);
  assert.equal((await fetch(origin + '/api/order-center?scope=admin')).status, 401);
});
