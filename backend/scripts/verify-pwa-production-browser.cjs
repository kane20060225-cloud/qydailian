'use strict';
// Production checks are anonymous. Only same-origin GET/HEAD requests are permitted.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const origin = 'https://wotbqydailian.vip';
(async () => {
  const output = path.resolve(__dirname, '../../artifacts/ui-preview/pwa-live');
  fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(output, 'browser-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge', viewport: { width: 1440, height: 960 }
  });
  try {
    await context.route('**/*', route => {
      const req = route.request();
      return new URL(req.url()).origin === origin && ['GET', 'HEAD'].includes(req.method()) ? route.continue() : route.abort();
    });
    const page = await context.newPage(), errors = [], consoleErrors = [], missing = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('response', response => { if (response.status() === 404) missing.push(response.url()); });
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.reload({ waitUntil: 'networkidle' });
    const registration = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(reg => ({
      scope: reg.scope, script: reg.active?.scriptURL, state: reg.active?.state
    })));
    assert.deepEqual(registration, [{ scope: origin + '/', script: origin + '/service-worker.js', state: 'activated' }]);
    const cdp = await context.newCDPSession(page);
    const manifest = await cdp.send('Page.getAppManifest'), installability = await cdp.send('Page.getInstallabilityErrors');
    assert.deepEqual(manifest.errors, []);
    assert.deepEqual(installability.installabilityErrors, []);
    const layouts = [];
    for (const width of [1440, 390]) for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width, height: 960 });
      await page.evaluate(theme => applyTheme(theme), theme);
      for (const target of ['mainMenu', 'boost', 'rental', 'tools']) {
        await page.evaluate(target => showSection(target), target);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}/${theme}/${target}`);
      }
      await page.evaluate(() => showSection('mainMenu'));
      await page.screenshot({ path: path.join(output, `${theme}-${width}-home.png`), fullPage: true });
      layouts.push({ width, theme });
    }
    const keys = await page.evaluate(async () => (await (await caches.open('qy-pwa-v1')).keys()).map(key => new URL(key.url).pathname));
    assert.equal(keys.some(route => route.startsWith('/api') || route.startsWith('/uploads') || route === '/' || route === '/index.html'), false);
    assert.ok(keys.includes('/offline.html'));
    assert.deepEqual(missing, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    const onlineErrors = [...consoleErrors];
    await context.setOffline(true);
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.title(), '暂时离线 | QY Blitz');
    await page.screenshot({ path: path.join(output, 'offline.png'), fullPage: true });
    await context.setOffline(false);
    await page.locator('a[href="/"]').click();
    await page.waitForFunction(() => document.title.startsWith('QY Blitz |'));
    assert.deepEqual(errors, []);
    const result = { origin, https_secure_context: await page.evaluate(() => isSecureContext), registration,
      manifest_errors: manifest.errors, installability_errors: installability.installabilityErrors,
      layouts, offline_recovery_verified: true, cached_paths: keys.length, sensitive_cached_paths: [],
      missing_resources: missing, page_errors: errors, online_console_errors: onlineErrors,
      production_business_writes: false, mobile_device_installation_tested: false, verified_at: new Date().toISOString() };
    fs.writeFileSync(path.join(output, 'verified.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
