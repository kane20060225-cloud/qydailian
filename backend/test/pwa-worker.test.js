'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const origin = 'https://pwa.example';
const source = fs.readFileSync(path.resolve(__dirname, '../../public/service-worker.js'), 'utf8');

function harness() {
  const listeners = {}, stores = new Map(), calls = [];
  let responder = () => asset('current');
  class BrowserRequest extends Request {
    constructor(input, options) { super(typeof input === 'string' ? new URL(input, origin) : input, options); }
  }
  const key = input => typeof input === 'string' ? new URL(input, origin).href : input.url;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(input, response) { store.set(key(input), response.clone()); },
        async match(input) { return store.get(key(input))?.clone(); },
        async keys() { return [...store.keys()].map(url => new BrowserRequest(url)); },
        async delete(input) { return store.delete(key(input)); }
      };
    }
  };
  const self = { location: { origin }, addEventListener: (name, fn) => { listeners[name] = fn; },
    skipWaiting: async () => {}, clients: { claim: async () => {} } };
  vm.runInNewContext(source, { self, Request: BrowserRequest, Response, URL, caches,
    fetch: async request => { calls.push(request); return responder(request); } });
  async function dispatch(name, request) {
    const pending = [];
    let result;
    listeners[name]({ request, waitUntil: promise => pending.push(promise), respondWith: promise => { result = promise; } });
    const response = result ? await result : undefined;
    await Promise.all(pending);
    return response;
  }
  return { stores, calls, caches, dispatch, request: (route, options) => new BrowserRequest(new URL(route, origin), options),
    respond: fn => { responder = fn; } };
}
function asset(body, options = {}) {
  const response = new Response(body, { headers: { 'Content-Type': 'text/css' }, ...options });
  Object.defineProperty(response, 'type', { value: 'basic' });
  return response;
}

test('worker never intercepts business, authenticated, mutating, unknown or cross-origin requests', async () => {
  const h = harness();
  for (const route of ['/api/auth/login', '/api/user/profile', '/api/orders', '/api/payment/create', '/api/admin/orders',
    '/uploads/screenshot.png', '/private-support/file.png', '/admin/panel.js', '/unknown.css', '/service-worker.js',
    '/style.css?token=secret', '/style.css?v=1&user=7', '/style.css?v=1&v=2', '/style.css?v=', 'https://third-party.example/style.css']) {
    assert.equal(await h.dispatch('fetch', h.request(route)), undefined, route);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
    assert.equal(await h.dispatch('fetch', h.request('/style.css', { method })), undefined, method);
  }
  for (const headers of [{ Authorization: 'Bearer synthetic' }, { Range: 'bytes=0-10' }]) {
    assert.equal(await h.dispatch('fetch', h.request('/style.css', { headers })), undefined);
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.stores.size, 0);
});

test('public assets always hit the network, fall back only on network failure and use exact versions', async () => {
  const h = harness(), request = h.request('/style.css?v=one');
  h.respond(() => asset('first'));
  assert.equal(await (await h.dispatch('fetch', request)).text(), 'first');
  assert.equal(h.calls[0].credentials, 'omit');
  assert.equal(h.calls[0].cache, 'no-store');
  h.respond(() => asset('fresh'));
  assert.equal(await (await h.dispatch('fetch', request)).text(), 'fresh');
  h.respond(() => { throw new TypeError('offline'); });
  assert.equal(await (await h.dispatch('fetch', request)).text(), 'fresh');
  await assert.rejects(h.dispatch('fetch', h.request('/style.css?v=two')), /offline/);
  h.respond(() => asset('not found', { status: 404 }));
  assert.equal((await h.dispatch('fetch', request)).status, 404);
  h.respond(() => asset('new version'));
  await h.dispatch('fetch', h.request('/style.css?v=two'));
  assert.deepEqual([...h.stores.get('qy-pwa-v1').keys()], [origin + '/style.css?v=two']);
});

test('private, no-store, redirected, error and wrong-MIME responses are not cached', async () => {
  const h = harness();
  for (const response of [
    asset('private', { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'private' } }),
    asset('private', { headers: { 'Content-Type': 'text/css', 'Cache-Control': 'no-store' } }),
    asset('vary', { headers: { 'Content-Type': 'text/css', Vary: '*' } }),
    asset('<html>login</html>', { headers: { 'Content-Type': 'text/html' } }),
    asset('denied', { status: 401 }), asset('failed', { status: 500 })
  ]) {
    h.respond(() => response);
    await h.dispatch('fetch', h.request('/style.css'));
    assert.equal(h.stores.size, 0);
  }
  const redirect = asset('redirect');
  Object.defineProperty(redirect, 'redirected', { value: true });
  h.respond(() => redirect);
  await h.dispatch('fetch', h.request('/style.css'));
  assert.equal(h.stores.size, 0);
});

test('installation caches only the neutral offline document, activation removes only previous PWA caches', async () => {
  const h = harness();
  h.respond(() => asset('neutral offline', { headers: { 'Content-Type': 'text/html' } }));
  await h.dispatch('install');
  assert.deepEqual([...h.stores.get('qy-pwa-v1').keys()], [origin + '/offline.html']);
  await h.caches.open('qy-pwa-v0');
  await h.caches.open('unrelated-cache');
  await h.dispatch('activate');
  assert.deepEqual([...h.stores.keys()].sort(), ['qy-pwa-v1', 'unrelated-cache']);
  h.respond(() => { throw new TypeError('offline'); });
  const navigation = h.request('/');
  Object.defineProperty(navigation, 'mode', { value: 'navigate' });
  assert.equal(await (await h.dispatch('fetch', navigation)).text(), 'neutral offline');
  for (const route of ['/api/orders', '/admin', '/?payment=return']) {
    const request = h.request(route);
    Object.defineProperty(request, 'mode', { value: 'navigate' });
    assert.equal(await h.dispatch('fetch', request), undefined);
  }
  h.respond(() => asset('server error', { status: 500 }));
  assert.equal((await h.dispatch('fetch', navigation)).status, 500);
  assert.equal(h.stores.get('qy-pwa-v1').size, 1, 'Never cache live HTML navigation');
});
