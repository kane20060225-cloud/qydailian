'use strict';
// Real service worker + synthetic business API, with no production/data writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');
Object.assign(process.env, {
  JWT_SECRET: 'pwa-browser-test-only', DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  DB_HOST: '127.0.0.1', DB_USER: 'test-user', DB_PASSWORD: 'test-password',
  DB_NAME: 'test-database', ALIPAY_ENABLED: 'false'
});
const { app: website } = require('../server');

(async () => {
  const output = path.resolve(__dirname, '../../artifacts/ui-preview/pwa');
  fs.mkdirSync(output, { recursive: true });
  const app = express(), apiRequests = [];
  let revision = 1;
  let retiring = false;
  app.get('/service-worker.js', (req, res) => {
    res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' });
    res.send(fs.readFileSync(path.resolve(__dirname, retiring ? './pwa-retire-worker.js' : '../../public/service-worker.js'), 'utf8'));
  });
  app.use(express.json());
  app.use('/api', (req, res) => {
    apiRequests.push({ path: req.path, method: req.method, authorization: req.get('authorization') || null });
    res.set('Cache-Control', 'no-store');
    if (req.path === '/pwa-test') return res.json({ revision, method: req.method });
    if (req.path === '/auth/login') return res.json({ success: true, token: 'synthetic', user: { id: 7, username: '测试用户', role: 'user' } });
    if (req.path === '/user/profile') return res.json({ id: 7, username: '测试用户', role: 'user', revision });
    if (req.path === '/user/settings') return res.json({ theme: 'dark', success: true });
    if (req.path === '/user/credits') return res.json({ qy_credits: 1200 });
    if (req.path === '/chest/tickets') return res.json({ tickets: 0 });
    if (req.path === '/order-center') return res.json({ orders: [], summary: [], total: 0, page: 1, page_size: 25 });
    if (req.path === '/service-content') {
      const content = require('../lib/service-content');
      return res.json(content.published({ revision: 1, ...content.defaults }));
    }
    return res.json([]);
  });
  app.use(website);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const profile = fs.mkdtempSync(path.join(output, 'browser-profile-'));
    const context = await chromium.launchPersistentContext(profile, {
      headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge', viewport: { width: 1440, height: 960 }
    });
    browser = context.browser();
    const page = await context.newPage(), errors = [], consoleErrors = [], missing = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() === 404) missing.push(response.url()); });
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const registered = await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.map(reg => ({ scope: reg.scope, script: reg.active?.scriptURL, state: reg.active?.state }));
    });
    assert.deepEqual(registered, [{ scope: origin + '/', script: origin + '/service-worker.js', state: 'activated' }]);
    await page.reload({ waitUntil: 'networkidle' });
    const cdp = await context.newCDPSession(page);
    const manifest = await cdp.send('Page.getAppManifest');
    assert.equal(manifest.url, origin + '/manifest.webmanifest');
    assert.deepEqual(manifest.errors, []);
    const installability = await cdp.send('Page.getInstallabilityErrors');
    assert.deepEqual(installability.installabilityErrors, [], JSON.stringify(installability));
    for (const width of [1440, 390, 360]) {
      await page.setViewportSize({ width, height: 960 });
      for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => applyTheme(theme), theme);
        await page.evaluate(() => showSection('mainMenu'));
        assert.equal(await page.locator('#pwaInstallArea').isVisible(), true);
        // Native event may already be emitted; never assert a fixed browser engagement policy.
        await page.evaluate(() => {
          const event = new Event('beforeinstallprompt', { cancelable: true });
          event.prompt = async () => {};
          event.userChoice = Promise.resolve({ outcome: 'dismissed' });
          window.dispatchEvent(event);
        });
        assert.equal(await page.locator('#pwaInstallButton').isVisible(), true);
        assert.equal(await page.locator('#pwaInstallButtonLabel').textContent(), '安装到桌面');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}/${theme}: overflow`);
        await page.screenshot({ path: path.join(output, `${theme}-${width}-install.png`), fullPage: true });
        await page.locator('#pwaInstallButton').click();
        assert.equal(await page.locator('#pwaInstallButton').isVisible(), true);
        assert.equal(await page.locator('#pwaInstallButtonLabel').textContent(), '查看安装方法');
      }
    }
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => {};
      event.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(event);
      window.dispatchEvent(new Event('appinstalled'));
    });
    assert.equal(await page.locator('#pwaInstallArea').isHidden(), true);
    // Verify existing login UI and navigation with the active worker.
    await page.locator('#openLoginBtn').click();
    await page.locator('#loginUsername').fill('测试用户');
    await page.locator('#loginPassword').fill('synthetic-password');
    await page.locator('#loginForm').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => localStorage.getItem('token') === 'synthetic');
    await page.evaluate(() => showSection('profile'));
    await page.waitForFunction(() => document.getElementById('profileInfo').textContent.includes('测试用户'));
    await page.evaluate(() => showSection('boost'));
    await page.goBack();
    assert.equal(await page.evaluate(() => document.body.dataset.currentSection), 'profile');
    await page.waitForFunction(() => !document.getElementById('userOrderCenter').textContent.includes('正在加载'));
    assert.equal(await page.locator('#userOrderCenter [role="alert"]').count(), 0);
    assert.equal(await page.locator('#userOrderCenter .oc-empty').count(), 1);
    const getBusiness = () => page.evaluate(async () => (await fetch('/api/pwa-test', { headers: { Authorization: 'Bearer synthetic' } })).json());
    assert.equal((await getBusiness()).revision, 1);
    revision = 2;
    assert.equal((await getBusiness()).revision, 2);
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const result = await page.evaluate(async method => (await fetch('/api/pwa-test', { method, headers: { Authorization: 'Bearer synthetic' } })).json(), method);
      assert.equal(result.method, method);
    }
    const keys = await page.evaluate(async () => {
      const cache = await caches.open('qy-pwa-v1');
      return (await cache.keys()).map(key => new URL(key.url).pathname);
    });
    assert.ok(keys.includes('/offline.html'));
    assert.ok(keys.includes('/style.css'));
    assert.equal(keys.some(route => /api|uploads|index\.html/.test(route) || route === '/'), false);
    assert.deepEqual(missing, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    const onlineConsoleErrors = [...consoleErrors];
    await context.setOffline(true);
    assert.equal(await page.evaluate(async () => { try { await fetch('/api/pwa-test'); return false; } catch { return true; } }), true);
    assert.ok(await page.evaluate(async () => (await fetch('/style.css?v=20260917-webp1')).text()).then(text => text.length > 100));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.title(), '暂时离线 | QY Blitz');
    await page.screenshot({ path: path.join(output, 'offline.png'), fullPage: true });
    await context.setOffline(false);
    await page.locator('a[href="/"]').click();
    await page.waitForFunction(() => document.title.startsWith('QY Blitz |'));
    assert.equal(await page.evaluate(() => localStorage.getItem('token')), 'synthetic');

    // iOS runtime detection (including iPad desktop UA); actual Apple installation needs a device.
    for (const standalone of [false, true]) {
      const ios = await browser.newContext({ viewport: { width: 390, height: 844 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
      await ios.addInitScript(value => Object.defineProperty(navigator, 'standalone', { value }), standalone);
      const iosPage = await ios.newPage();
      iosPage.on('pageerror', error => errors.push(error.message));
      await iosPage.goto(origin, { waitUntil: 'networkidle' });
      assert.equal(await iosPage.locator('#pwaInstallArea').isVisible(), !standalone);
      if (!standalone) {
        await iosPage.locator('#pwaInstallButton').click();
        assert.equal(await iosPage.locator('#pwaInstallGuide').isVisible(), true);
        assert.equal(await iosPage.locator('#pwaGuideSteps li').count(), 3);
        await iosPage.screenshot({ path: path.join(output, `ios-install-guide-${standalone ? 'standalone' : 'browser'}.png`), fullPage: true });
        await iosPage.locator('#pwaGuideDoneButton').click();
      }
      assert.equal(await iosPage.evaluate(() => document.documentElement.dataset.displayMode), standalone ? 'standalone' : 'browser');
      await iosPage.evaluate(() => showSection('rental'));
      assert.equal(await iosPage.evaluate(() => document.body.dataset.currentSection), 'rental');
      await ios.close();
    }
    const ipad = await browser.newContext({ viewport: { width: 820, height: 1180 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' });
    await ipad.addInitScript(() => {
      Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 });
    });
    const ipadPage = await ipad.newPage();
    ipadPage.on('pageerror', error => errors.push(error.message));
    await ipadPage.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(await ipadPage.locator('#pwaInstallArea').isVisible(), true);
    await ipad.close();
    const appMode = await browser.newContext();
    await appMode.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = query => {
        const result = nativeMatchMedia(query);
        if (query === '(display-mode: standalone)') Object.defineProperty(result, 'matches', { value: true });
        return result;
      };
    });
    const appPage = await appMode.newPage();
    appPage.on('pageerror', error => errors.push(error.message));
    await appPage.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(await appPage.evaluate(() => document.documentElement.dataset.displayMode), 'standalone');
    assert.equal(await appPage.locator('#pwaInstallArea').isHidden(), true);
    await appMode.close();
    assert.deepEqual(errors, []);
    // Exercise a real update to the rollback worker; no reload or user data removal.
    await page.evaluate(async () => { await caches.open('unrelated-test-cache'); });
    retiring = true;
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
    for (let attempt = 0; attempt < 40; attempt++) {
      const complete = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length === 0 &&
        !(await caches.keys()).some(name => name.startsWith('qy-pwa-')));
      if (complete) break;
      await page.waitForTimeout(250);
    }
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
    const retiredCaches = await page.evaluate(() => caches.keys());
    assert.equal(retiredCaches.some(name => name.startsWith('qy-pwa-')), false);
    assert.ok(retiredCaches.includes('unrelated-test-cache'));
    assert.equal(await page.evaluate(() => localStorage.getItem('token')), 'synthetic');
    assert.equal((await getBusiness()).revision, 2);
    const result = { scope: registered[0].scope, worker: registered[0].state, manifest_errors: manifest.errors,
      installability_errors: installability.installabilityErrors, static_cache_paths: keys.length,
      realtime_api_verified: true, mutation_methods_verified: ['POST', 'PUT', 'DELETE'],
      login_profile_orders_back_verified: true, offline_recovery_verified: true,
      viewport_widths: [1440, 390, 360], ios_detection_simulated: true, ipad_desktop_detection_simulated: true,
      display_mode_standalone_simulated: true,
      rollback_worker_update_unregister_cache_cleanup_verified: true,
      missing_resources: missing, page_errors: errors, console_errors_before_offline: onlineConsoleErrors,
      mobile_device_installation_tested: false };
    fs.writeFileSync(path.join(output, 'verified.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
