'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const express = require('express'), { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'artifacts/ui-preview', process.env.THEME_VERIFY_ORIGIN ? 'live-theme-b34' : 'theme-b34');
(async () => {
    fs.mkdirSync(output, { recursive: true });
    const app = express(); app.use(express.static(path.join(root, 'public')));
    const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    const origin = process.env.THEME_VERIFY_ORIGIN || `http://127.0.0.1:${server.address().port}`;
    let browser;
    try {
        browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
        for (const width of [1440, 390]) {
            const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
            await context.addInitScript(() => {
                if (!localStorage.getItem('__themeTestSeed')) {
                    Object.entries({ theme: 'dark', token: 'synthetic-a', userId: '7', username: '主题验收', role: 'user', __themeTestSeed: '1' }).forEach(([key, value]) => localStorage.setItem(key, value));
                }
            });
            const accounts = { 'synthetic-a': 'dark', 'synthetic-b': 'dark' }, writes = [], errors = [];
            let failSave = false, readDelay = 0, writeDelay = 0, activeWrites = 0, maxWrites = 0;
            await context.route('**/*', async route => {
                const request = route.request(), url = new URL(request.url());
                if (url.origin !== origin) return route.abort();
                if (!url.pathname.startsWith('/api/')) return ['GET', 'HEAD'].includes(request.method()) ? route.continue() : route.abort();
                let data = [], status = 200;
                if (url.pathname === '/api/user/settings') {
                    const token = (request.headers().authorization || '').replace('Bearer ', '');
                    if (request.method() === 'PUT') {
                        const theme = request.postDataJSON().theme; writes.push({ token, theme });
                        activeWrites++; maxWrites = Math.max(maxWrites, activeWrites);
                        if (writeDelay) await new Promise(resolve => setTimeout(resolve, writeDelay));
                        activeWrites--;
                        if (failSave) { status = 503; data = { error: '模拟网络故障' }; }
                        else { accounts[token] = theme; data = { success: true }; }
                    } else {
                        const theme = accounts[token]; if (readDelay) await new Promise(resolve => setTimeout(resolve, readDelay));
                        data = { user_id: token === 'synthetic-b' ? 8 : 7, theme };
                    }
                } else if (url.pathname === '/api/service-content') data = require('../lib/service-content').published({ revision: 1, ...require('../lib/service-content').defaults });
                else if (url.pathname === '/api/user/profile') data = { id: 7, username: '主题验收', role: 'user' };
                else if (url.pathname === '/api/user/credits') data = { qy_credits: 0, vip_level: 0 };
                else if (url.pathname === '/api/chest/tickets') data = { tickets: 0 };
                await route.fulfill({ status, json: data });
            });
            const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
            const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
            const saved = () => page.waitForFunction(() => localStorage.getItem('qy.theme.pending.v1.' + localStorage.getItem('userId')) === '');
            const appearance = async () => {
                await page.evaluate(() => showSection('settings'));
                await page.waitForFunction(() => document.querySelector('[data-setting="appearance"]').dataset.settingsBound === 'true' && document.querySelector('#settingsContent .card'));
                await page.locator('[data-setting="appearance"]').click(); await page.locator('#saveThemeBtn').waitFor();
            };
            await page.goto(origin, { waitUntil: 'networkidle' });
            await page.locator('#themeToggleBtn').click(); assert.equal(await theme(), 'light'); await saved();
            assert.equal(accounts['synthetic-a'], 'light'); await page.reload({ waitUntil: 'networkidle' }); assert.equal(await theme(), 'light');
            // Settings selection also autosaves without clicking the explicit save button.
            await appearance(); await page.locator('input[name=theme][value=dark]').check(); await saved();
            await page.reload({ waitUntil: 'networkidle' }); assert.equal(await theme(), 'dark');
            failSave = true; await page.locator('#themeToggleBtn').click();
            await page.waitForFunction(() => !!localStorage.getItem('qy.theme.pending.v1.7'));
            await page.reload({ waitUntil: 'networkidle' }); assert.equal(await theme(), 'light'); assert.equal(accounts['synthetic-a'], 'dark');
            await appearance(); failSave = false; await page.locator('#saveThemeBtn').click(); await saved();
            assert.equal(accounts['synthetic-a'], 'light'); await page.reload({ waitUntil: 'networkidle' }); assert.equal(await theme(), 'light');
            // A fresh local theme cache still reads the saved account preference.
            await page.evaluate(() => { localStorage.setItem('theme', 'dark'); localStorage.removeItem('qy.theme.account.v1.7'); });
            await page.reload({ waitUntil: 'networkidle' }); assert.equal(await theme(), 'light');
            await page.evaluate(() => { localStorage.setItem('token', 'synthetic-b'); localStorage.setItem('userId', '8'); checkLoginStatus(); });
            await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
            accounts['synthetic-b'] = 'dark'; readDelay = 600;
            await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#themeToggleBtn').click();
            assert.equal(await theme(), 'light'); await saved(); await page.waitForTimeout(650); assert.equal(await theme(), 'light');
            readDelay = 0; writeDelay = 180;
            await page.locator('#themeToggleBtn').click(); await page.waitForTimeout(30); await page.locator('#themeToggleBtn').click(); await page.locator('#themeToggleBtn').click();
            await saved(); assert.equal(accounts['synthetic-b'], 'dark'); assert.equal(maxWrites, 1); writeDelay = 0;
            await page.reload({ waitUntil: 'networkidle' }); assert.equal(await theme(), 'dark');
            const before = writes.length; await page.evaluate(() => { localStorage.setItem('token', ''); localStorage.setItem('userId', ''); checkLoginStatus(); });
            await page.locator('#themeToggleBtn').click(); await page.reload({ waitUntil: 'networkidle' }); assert.equal(await theme(), 'light'); assert.equal(writes.length, before);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
            assert.deepEqual(errors, []); await page.screenshot({ path: path.join(output, `light-${width}.png`), fullPage: true });
            console.log(`${width}: top toggle, settings autosave, reload, failed sync retry, account preference, account switch, delayed read, serialized toggles and guest persistence passed`);
            await context.close();
        }
    } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
