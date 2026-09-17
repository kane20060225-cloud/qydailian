'use strict';
// Production verification is anonymous and only permits same-origin GET/HEAD requests.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {chromium} = require('playwright');
const origin = 'https://wotbqydailian.vip';
(async () => {
  const output = path.resolve(__dirname, '../../artifacts/ui-preview'); fs.mkdirSync(output, {recursive: true});
  const browser = await chromium.launch({headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge'});
  try {
    for (const theme of ['dark', 'light']) for (const width of [1440, 390]) {
      const context = await browser.newContext({viewport: {width, height: width === 390 ? 844 : 1000}, reducedMotion: 'reduce'});
      try {
        await context.addInitScript(value => localStorage.setItem('theme', value), theme);
        await context.route('**/*', route => {
          const request = route.request();
          return new URL(request.url()).origin === origin && ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort();
        });
        const page = await context.newPage(), errors = [], assets = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (/\/(bg\.webp|bg\.png|esports-surfaces\.css|images\/tactical-grid\.svg)(\?|$)/.test(response.url())) assets.push({url: response.url(), status: response.status()}); });
        await page.goto(origin, {waitUntil: 'networkidle'});
        assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
        assert.ok(assets.some(asset => asset.url.includes('esports-surfaces.css') && asset.status === 200));
        if (theme === 'dark') assert.ok(assets.some(asset => asset.url.includes('bg.webp') && asset.status === 200));
        assert.equal(assets.some(asset => asset.url.includes('bg.png')), false, 'Original PNG must not load');
        assert.ok(assets.every(asset => asset.status === 200));
        const check = async name => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${theme} ${width} ${name} overflow`);
          assert.deepEqual(errors, []);
          await page.screenshot({path: path.join(output, `live-b22-${theme}-${width}-${name}.png`), fullPage: true});
        };
        await check('home');
        await page.evaluate(() => showSection('boost')); await page.locator('#boostNext').waitFor(); await check('boost');
        await page.locator('#themeToggleBtn').click();
        assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme === 'dark' ? 'light' : 'dark');
        console.log(`${theme} ${width}: live assets, WebP, layout, theme switch and script errors passed.`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
