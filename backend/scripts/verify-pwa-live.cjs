'use strict';
// Anonymous, same-origin GET requests only; never submit orders or use credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const origin = new URL(process.argv[2] || 'https://wotbqydailian.vip').origin;
const publicDir = path.resolve(__dirname, '../../public');
const normalize = bytes => bytes.toString('utf8').replace(/\r\n/g, '\n');

async function read(route) {
  const url = new URL(route, origin);
  assert.equal(url.origin, origin);
  const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, route);
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}
(async () => {
  assert.ok(origin.startsWith('https://'), 'Production PWA must use HTTPS');
  const { bytes: htmlBytes } = await read('/');
  assert.equal(normalize(htmlBytes), normalize(fs.readFileSync(path.join(publicDir, 'index.html'))), 'Live index differs from this release');
  const { response: manifestResponse, bytes: manifestBytes } = await read('/manifest.webmanifest');
  assert.match(manifestResponse.headers.get('content-type'), /application\/manifest\+json/);
  assert.equal(normalize(manifestBytes), normalize(fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'))));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.lang, 'zh-CN');
  for (const icon of manifest.icons) {
    const { response, bytes } = await read(icon.src);
    assert.match(response.headers.get('content-type'), /image\/png/);
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
    assert.ok(bytes.equals(fs.readFileSync(path.join(publicDir, icon.src.slice(1)))), icon.src + ' differs from this release');
  }
  const { response: workerResponse, bytes: workerBytes } = await read('/service-worker.js');
  assert.match(workerResponse.headers.get('content-type'), /javascript/);
  assert.match(workerResponse.headers.get('cache-control') || '', /no-store/);
  assert.equal(workerResponse.headers.get('service-worker-allowed'), '/');
  assert.equal(normalize(workerBytes), normalize(fs.readFileSync(path.join(publicDir, 'service-worker.js'))));
  new vm.Script(workerBytes.toString('utf8'));
  const assets = new Set(['/offline.html', '/pwa.js', '/pwa.css']);
  for (const match of htmlBytes.toString('utf8').matchAll(/<(?:script|link|img)\b[^>]*\b(?:href|src)="([^"]+)"/g)) {
    const url = new URL(match[1].replace(/&amp;/g, '&'), origin);
    if (url.origin === origin && url.pathname !== '/') assets.add(url.pathname + url.search);
  }
  for (const route of assets) {
    const { bytes } = await read(route);
    const filename = new URL(route, origin).pathname.slice(1);
    const local = fs.readFileSync(path.join(publicDir, filename));
    if (/\.(png|ico|webp)$/.test(filename)) assert.ok(bytes.equals(local), route);
    else assert.equal(normalize(bytes), normalize(local), route);
  }
  assert.equal((await fetch(origin + '/api/health', { signal: AbortSignal.timeout(15000) })).status, 200);
  for (const route of ['/api/user/profile', '/api/order-center?scope=admin']) {
    assert.equal((await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(15000) })).status, 401);
  }
  console.log(JSON.stringify({ origin, https: true, manifest_valid: true, scope: '/', icons: manifest.icons.length,
    static_assets_verified: assets.size, service_worker_headers_valid: true, auth_guards_valid: true,
    browser_registration_requires_devtools_check: true }, null, 2));
})().catch(error => { console.error('PWA live verification failed:', error.message); process.exitCode = 1; });
