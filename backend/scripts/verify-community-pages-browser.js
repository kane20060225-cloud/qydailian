'use strict';
// Use synthetic API fixtures. Optional live asset checks permit same-origin GET/HEAD only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');

(async () => {
  const output = path.resolve(__dirname, process.env.COMMUNITY_VERIFY_ORIGIN ? '../../artifacts/ui-preview/live-community-ui' : '../../artifacts/community-ui');
  fs.mkdirSync(output, { recursive: true });
  const app = express();
  app.use(express.static(path.resolve(__dirname, '../../public')));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = process.env.COMMUNITY_VERIFY_ORIGIN || `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    for (const theme of ['dark', 'light']) {
      for (const width of [1440, 768, 390, 360]) {
        const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
        await context.addInitScript(value => {
          localStorage.setItem('theme', value);
          localStorage.setItem('token', 'synthetic');
          localStorage.setItem('userId', '7');
          localStorage.setItem('username', '测试用户');
          localStorage.setItem('role', 'user');
        }, theme);
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await context.route('**/*', async route => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (!['GET', 'HEAD'].includes(route.request().method())) return route.abort();
          if (!url.pathname.startsWith('/api/')) return route.continue();
          let data = [];
          if (url.pathname === '/api/service-content') data = require('../lib/service-content').published({ revision: 1, ...require('../lib/service-content').defaults });
          else if (url.pathname === '/api/user/settings') data = { theme };
          else if (url.pathname === '/api/user/credits') data = { qy_credits: 1200 };
          else if (url.pathname === '/api/user/profile') data = { id: 7, username: '测试用户', role: 'user' };
          else if (url.pathname === '/api/announcements') data = { title: '平台公告', content: '欢迎来到 QingYi 情谊平台！\n请仔细确认服务内容、价格及相关要求。\n订单进度可在个人中心查看。' };
          else if (url.pathname === '/api/game-news') data = [
            { id: 1, title: '版本更新与活动资讯', summary: '了解新版本内容及活动开放时间。', content: '新版本现已上线。', category: 'in_game', label: '版本', cover_url: '/bg.webp', is_featured: 1, published_at: '2026-09-18T00:00:00Z', created_at: '2026-09-18T00:00:00Z' },
            { id: 2, title: '游戏动态', summary: '更多游戏资讯将在这里发布。', content: '战场动态持续更新。', category: 'in_game', label: '动态', created_at: '2026-09-17T00:00:00Z' },
            { id: 3, title: '社区挑战赛', summary: '和队友一起参与社区挑战。', content: '社区挑战赛现已开放报名。', category: 'community', label: '赛事', cover_url: '/bg.webp', published_at: '2026-09-19T00:00:00Z', created_at: '2026-09-19T00:00:00Z' }
          ];
          else if (url.pathname === '/api/rental/accounts') data = [{ id: 1, client_type: 'Android', tank_list: 'IS-7\nT-54\nE 100', hourly_price: 2, daily_price: 24, available_time_desc: '每天 18:00–24:00', rules: '禁止改密；禁止排位', owner_name: '测试出租方', availability_status: 'available' }];
          return route.fulfill({ json: data });
        });
        const checkLayout = async name => {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${theme}/${width}/${name}: page overflow`);
          assert.deepEqual(errors, [], `${name}: browser errors`);
          if (width === 1440 || width === 390) await page.screenshot({ path: path.join(output, `${theme}-${width}-${name}.png`), fullPage: true });
        };
        await page.goto(origin, { waitUntil: 'networkidle' });
        for (const section of ['rental', 'announcement', 'news', 'tools']) {
          await page.evaluate(value => showSection(value), section);
          await page.waitForTimeout(150);
          await checkLayout(section);
          if (section === 'news') {
            assert.equal(await page.locator('.game-news-card').count(), 2);
            await page.locator('[data-news-category="community"]').click();
            assert.equal(await page.locator('.game-news-card').count(), 1);
            await page.locator('.game-news-card-button').click();
            assert.equal(await page.locator('#gameNewsDetailModal').isVisible(), true);
            await page.locator('#closeGameNewsDetailBtn').click();
            assert.equal(await page.locator('#gameNewsDetailModal').isVisible(), false);
            await page.locator('[data-news-category="in_game"]').click();
          }
          if (width > 1000 && ['rental', 'tools'].includes(section)) {
            const inline = await page.locator('.community-page:visible .section-top').evaluate(el => {
              const heading = el.querySelector('.section-heading').getBoundingClientRect();
              return Array.from(el.querySelectorAll('.panel-nav button')).every(button => {
                const rect = button.getBoundingClientRect();
                return Math.abs(rect.y + rect.height / 2 - heading.y - heading.height / 2) < 2 && rect.x > heading.right;
              });
            });
            assert.ok(inline, section + ' submenu must remain beside its title');
          }
          const communitySurface = page.locator('.community-page:visible .card, .community-page:visible .rental-account-card, .community-page:visible .game-news-card-button').first();
          assert.ok(await communitySurface.count(), `${section}: expected a visible community surface`);
          assert.doesNotMatch(await communitySurface.evaluate(el => getComputedStyle(el).backgroundImage), /tactical-grid/);
          assert.equal(await page.locator('.community-page:visible').evaluate(el => {
            const palette = ['--accent', '--accent-soft', '--accent-border', '--accent-glow', '--bg', '--card-bg', '--surface-muted', '--border', '--text', '--text-secondary', '--price', '--primary-bg', '--utility-bg', '--utility-text'];
            const original = getComputedStyle(document.body), current = getComputedStyle(el);
            return palette.every(token => original.getPropertyValue(token).trim() === current.getPropertyValue(token).trim());
          }), true, 'Community pages must inherit the original theme colors');
        }
        await page.locator('input[name=calcType][value=average]').check();
        assert.equal(await page.locator('#calcLabelUnit').textContent(), '场均伤害');
        assert.equal(await page.locator('#calcDescription').textContent().then(text => text.includes('胜率')), false);
        assert.deepEqual(await page.locator('[data-calc-unit]').allTextContents(), ['（伤害）', '（伤害）', '（伤害）']);
        assert.equal(await page.locator('#currentValue').getAttribute('max'), null);
        assert.equal(await page.locator('#currentValue').getAttribute('placeholder'), '例如 1500');
        const fieldGeometry = await page.locator('.calc-field').first().evaluate(el => {
          const label = el.querySelector('label'), span = label.querySelector('span'), input = el.querySelector('input');
          return { aligned: Math.abs(label.getBoundingClientRect().y - span.getBoundingClientRect().y) < 8, contained: input.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1 };
        });
        assert.ok(fieldGeometry.aligned && fieldGeometry.contained, 'Calculator label must stay inline and input inside grid');
        for (const [id, value] of Object.entries({ currentValue: '1500', currentBattles: '5000', targetValue: '2000', expectedValue: '2500' })) await page.locator('#' + id).fill(value);
        await page.locator('#calcBtn').click();
        assert.match(await page.locator('#calcResultText').textContent(), /还需要 5000 场/);
        await checkLayout('average');
        await page.locator('input[name=calcType][value=winrate]').check();
        assert.equal(await page.locator('#currentValue').inputValue(), '');
        assert.equal(await page.locator('#currentValue').getAttribute('max'), '100');
        assert.equal(await page.locator('#calcResult').isVisible(), false);
        for (const [id, value] of Object.entries({ currentValue: '55', targetValue: '60', expectedValue: '70' })) await page.locator('#' + id).fill(value);
        await page.locator('#calcBtn').click();
        assert.match(await page.locator('#calcResultText').textContent(), /还需要 2500 场/);
        await page.locator('#currentValue').fill('101');
        await page.locator('#calcBtn').click();
        assert.match(await page.locator('#calcResultText').textContent(), /有效数值/);
        await page.locator('#currentValue').fill('65');
        await page.locator('#expectedValue').fill('50');
        await page.locator('#calcBtn').click();
        assert.match(await page.locator('#calcResultText').textContent(), /已达标/);
        await page.evaluate(() => showSection('rental'));
        for (const tab of ['publish', 'rented', 'my']) {
          await page.locator(`[data-rentaltab=${tab}]`).click();
          await page.waitForTimeout(100);
          await checkLayout('rental-' + tab);
        }
        await page.evaluate(() => showSection('tools'));
        for (const tool of ['chestsim', 'randomtank']) {
          await page.locator(`[data-tool=${tool}]`).click();
          await checkLayout(tool);
        }
        await page.evaluate(() => showSection('boost'));
        assert.match(await page.locator('#sectionBoost .card').first().evaluate(el => getComputedStyle(el).backgroundImage), /tactical-grid/);
        console.log(`${theme} ${width}: community layouts, rental tabs, tools, calculator modes and checkout separation passed`);
        await context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
