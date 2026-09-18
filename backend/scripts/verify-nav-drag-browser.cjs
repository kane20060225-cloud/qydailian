'use strict';
// Browser regression checks use synthetic API data and never write business records.
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');

(async () => {
  const app = express();
  app.use(express.static(path.resolve(__dirname, '../../public')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = process.env.NAV_VERIFY_ORIGIN || `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
    for (const theme of ['dark', 'light']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
      await context.addInitScript(theme => {
        localStorage.setItem('theme', theme);
        localStorage.setItem('token', 'synthetic');
        localStorage.setItem('userId', '7');
        localStorage.setItem('username', '测试用户');
        localStorage.setItem('role', 'user');
      }, theme);
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort();
        let data = [];
        if (url.pathname === '/api/service-content') data = require('../lib/service-content').published({ revision: 1, ...require('../lib/service-content').defaults });
        else if (url.pathname === '/api/user/settings') data = request.method() === 'PUT' ? { success: true } : { theme };
        else if (url.pathname === '/api/user/profile') data = { id: 7, username: '测试用户', role: 'user' };
        else if (url.pathname === '/api/chest/tickets') data = { tickets: 0 };
        else if (url.pathname === '/api/user/credits') data = { qy_credits: 0 };
        return route.fulfill({ json: data });
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin, { waitUntil: 'networkidle' });
      await page.evaluate(() => {
        window.__navDrag = [];
        for (const name of ['dragstart', 'dragend', 'pointercancel']) document.addEventListener(name, event => {
          window.__navDrag.push({ type: name, canceled: event.defaultPrevented });
        });
      });
      const drag = async link => {
        await page.evaluate(() => { window.__navDrag = []; });
        const rect = await link.boundingBox();
        await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
        await page.mouse.down();
        await page.mouse.move(rect.x + rect.width + 80, rect.y + 100, { steps: 12 });
        await page.mouse.up();
        return page.evaluate(() => window.__navDrag);
      };
      const targets = ['boost', 'rental', 'tools', 'announcement', 'news'];
      for (const target of targets) {
        const link = page.locator(`.site-nav-link[data-nav-target="${target}"]`);
        assert.equal(await link.evaluate(link => link.draggable), false);
        assert.equal(await link.getAttribute('href'), '#' + target);
        await page.evaluate(() => showSection('announcement'));
        assert.deepEqual(await drag(link), [], `${theme}/${target}: native drag must not start`);
        await link.click();
        assert.equal(await page.evaluate(() => document.body.dataset.currentSection), target);
        await page.evaluate(() => showSection('announcement'));
        await link.focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.body.dataset.currentSection), target);
      }
      // Exercise the scoped fallback with an actual drag, even if a child/attribute enables dragging.
      const first = page.locator('.site-nav-link[data-nav-target="boost"]');
      await first.evaluate(link => { link.draggable = true; });
      assert.deepEqual(await drag(first), [{ type: 'dragstart', canceled: true }]);
      await first.evaluate(link => { link.draggable = false; });
      await first.focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.navTarget), 'rental');
      assert.equal(await page.locator('.logo-area').evaluate(link => link.draggable), true);
      assert.equal(await page.locator('#themeToggleBtn').evaluate(button => button.draggable), false);
      await page.locator('#themeToggleBtn').click();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme === 'dark' ? 'light' : 'dark');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.mobile-nav-btn[data-nav-target="tools"]').click();
      assert.equal(await page.evaluate(() => document.body.dataset.currentSection), 'tools');
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ theme, native_drags_blocked: 5, clicks_verified: 5, keyboard_verified: 5, fallback_verified: true, mobile_navigation_verified: true }));
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
