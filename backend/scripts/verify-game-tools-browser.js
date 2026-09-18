'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const express = require('express'), { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..'), output = path.join(root, 'artifacts/ui-preview', process.env.GAME_TOOLS_VERIFY_ORIGIN ? 'live-game-tools-b33' : 'game-tools-b33');
const chestNames = ['美国集装箱', '苏联集装箱', '顶尖捕食者集装箱', '超赞集装箱', '我全都要集装箱', '超大集装箱', '重坦集装箱', '泰坦集装箱', '赛季集装箱'];
const chestFixtures = chestNames.map((name, i) => ({ id: i + 1, name, price: 198 + i * 10, image: `images/chests/chest_${i + 1}.png`, description: '开启集装箱，收集稀有坦克与战斗资源。查看奖池后再选择你的补给。', rare_items: [{ item_name: '概念型 1B', weight: 3 }, { item_name: 'IS-7', weight: 2 }], common_rewards: [{ item_name: '银币', min_quantity: 50000, max_quantity: 150000, drop_chance: 100 }, { item_name: '全局经验', min_quantity: 1000, max_quantity: 5000, drop_chance: 40 }] }));

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const baseline = process.env.GAME_TOOLS_BASELINE || cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
  const archive = path.join(output, 'baseline.tar'), old = path.join(output, 'baseline');
  fs.writeFileSync(archive, cp.execFileSync('git', ['archive', '--format=tar', baseline, 'public'], { cwd: root, maxBuffer: 32 * 1024 * 1024 }));
  fs.mkdirSync(old, { recursive: true }); cp.execFileSync('tar', ['-xf', archive, '-C', old]);
  const app = express(); app.use('/baseline', express.static(path.join(old, 'public'))); app.use(express.static(path.join(root, 'public')));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const localOrigin = `http://127.0.0.1:${server.address().port}`, origin = process.env.GAME_TOOLS_VERIFY_ORIGIN || localOrigin;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    for (const theme of ['dark', 'light']) for (const width of [1440, 768, 390, 360]) {
      const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
      await context.addInitScript(value => { localStorage.clear(); for (const [key, item] of Object.entries({ theme: value, token: 'synthetic', userId: '7', username: '界面验收', role: 'user' })) localStorage.setItem(key, item); }, theme);
      let opens = 0, failOpen = false, failInventory = false, failConfigs = false, tickets = 12000;
      await context.route('**/*', async route => {
        const url = new URL(route.request().url()); if (![origin, localOrigin].includes(url.origin)) return route.abort();
        // All API requests use fixtures, including mutations. Live assets are read-only.
        if (!url.pathname.startsWith('/api/')) return ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort();
        let data = [], status = 200;
        const p = url.pathname;
        if (p === '/api/service-content') data = require('../lib/service-content').published({ revision: 1, ...require('../lib/service-content').defaults });
        else if (p === '/api/user/settings') data = { theme };
        else if (p === '/api/user/profile') data = { id: 7, username: '界面验收', role: 'user' };
        else if (p === '/api/user/credits') data = { qy_credits: 1200, vip_level: 2 };
        else if (p === '/api/chest/configs') { if (failConfigs) { status = 503; data = { error: '集装箱暂不可用' }; } else data = chestFixtures; }
        else if (p === '/api/chest/tickets') data = { tickets };
        else if (p === '/api/chest/checkin') { tickets += 1000; data = { message: '签到成功' }; }
        else if (p === '/api/chest/open') {
          opens++; await new Promise(resolve => setTimeout(resolve, 150));
          if (failOpen) { status = 400; data = { error: '军需券不足' }; }
          else { const chestId = route.request().postDataJSON().chestId; tickets -= chestFixtures.find(chest => chest.id === chestId).price; data = { success: true, tickets, rewards: [{ item_name: 'IS-7', rarity: 'rare', quantity: 1 }, { item_name: '银币', rarity: 'normal', quantity: 50000 }] }; }
        }
        else if (p === '/api/chest/inventory') { if (failInventory) { status = 503; data = { error: '仓库暂不可用' }; } else data = [{ item_name: 'IS-7', rarity: 'rare', quantity: 2, chest_id: 1, obtained_at: '2026-09-18T00:00:00Z' }, { item_name: '银币', rarity: 'normal', quantity: 100000, chest_id: 2, obtained_at: '2026-09-18T00:00:00Z' }]; }
        else if (p === '/api/announcements') data = { title: '平台公告', content: '欢迎来到平台！\n请确认服务内容及价格。' };
        else if (p === '/api/game-news') data = [{ title: '游戏资讯', content: '版本更新与活动内容。', created_at: '2026-09-18T00:00:00Z' }];
        else if (p === '/api/rental/accounts') data = [{ id: 1, client_type: 'Android', tank_list: 'IS-7\nT-54', hourly_price: 2, daily_price: 24, availability_status: 'available', available_time_desc: '全天', rules: '禁止改密', owner_name: '测试出租方' }];
        return route.fulfill({ status, json: data });
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin, { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: '* { transition: none !important; }' });
      // Compare unaffected panels with the previous committed version in the same browser.
      const previous = await context.newPage(); await previous.goto(localOrigin + '/baseline/', { waitUntil: 'networkidle' });
      await previous.addStyleTag({ content: '* { transition: none !important; }' });
      const layout = async (target, section) => {
        await target.evaluate(value => { showSection(value === 'calculator' ? 'tools' : value); if (value === 'calculator') switchTool('calculator'); }, section);
        await target.waitForTimeout(80);
        return target.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(el => el.getClientRects().length && !el.closest('.toast-message')).map(el => {
          const r = el.getBoundingClientRect(), s = getComputedStyle(el), round = n => Math.round(n * 2) / 2;
          return [el.tagName + ':' + el.id + ':' + String(el.className), [r.x + scrollX, r.y + scrollY, r.width, r.height].map(round), s.fontSize, s.padding, s.margin, s.borderRadius, s.backgroundColor, s.color];
        }));
      };
      for (const section of ['mainMenu', 'boost', 'rental', 'announcement', 'news', 'calculator']) assert.deepEqual(await layout(page, section), await layout(previous, section), `${theme}/${width}/${section}: unrelated UI changed`);
      await previous.close();
      const screenshot = async name => {
        await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('.toast-message').forEach(el => el.remove()); });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name + ' horizontal overflow');
        assert.deepEqual(errors, [], name + ' browser errors');
        if ([1440, 390].includes(width)) await page.screenshot({ path: path.join(output, `${theme}-${width}-${name}.png`), fullPage: true });
      };
      await page.evaluate(() => { showSection('tools'); switchTool('chestsim'); });
      await page.locator('.supply-chest-card').first().waitFor();
      assert.equal(await page.locator('.supply-chest-card').count(), 9);
      await page.locator('[data-chest-id="3"]').click();
      assert.equal(await page.locator('.supply-chest-card img').evaluateAll(images => images.every(image => {
        const r = image.getBoundingClientRect(), card = image.closest('button').getBoundingClientRect();
        return r.left >= card.left && r.right <= card.right + 1;
      })), true, 'Chest art must fit inside its card');
      assert.equal(await page.locator('#selectedChestName').textContent(), chestNames[2]);
      assert.equal(await page.locator('[data-chest-id="3"]').getAttribute('aria-pressed'), 'true');
      assert.match(await page.locator('#chestDetailProb').textContent(), /3.00%/);
      assert.match(await page.locator('#chestDetailProb').textContent(), /首项奖励保底/);
      await screenshot('supply');
      await page.locator('#checkinBtn').click(); await page.waitForFunction(() => document.querySelector('#checkinBtn').disabled && document.querySelector('#checkinBtn').textContent.includes('今日已签到'));
      await page.locator('#buyChestBtn').click();
      assert.equal(await page.locator('#buyChestBtn').isDisabled(), true);
      await page.evaluate(() => document.querySelector('#buyChestBtn').click());
      await page.locator('#chestRewards').waitFor({ state: 'visible' });
      assert.equal(opens, 1, 'Only one purchase request may be sent');
      assert.equal(await page.locator('#chestRewardGrid .reward-card').count(), 2);
      assert.equal(await page.locator('#chestRewardGrid .game-tank-image').count(), 1);
      assert.equal(await page.locator('#ticketBalance').textContent(), tickets.toLocaleString('zh-CN'));
      await screenshot('rewards');
      await page.locator('#rewardInventoryBtn').click(); await page.locator('#inventoryList .reward-card').first().waitFor();
      assert.equal(await page.locator('#inventoryList table').count(), 0);
      await page.locator('.inventory-record').first().click();
      assert.match(await page.locator('#inventoryList').textContent(), /来源：美国集装箱/);
      await screenshot('inventory'); await page.locator('#closeInventoryBtn').click();
      failOpen = true; await page.locator('#buyChestBtn').click(); await page.locator('#chestBuyMsg').waitFor({ state: 'visible' });
      assert.match(await page.locator('#chestBuyMsg').textContent(), /军需券不足/); assert.equal(await page.locator('#buyChestBtn').isDisabled(), false); failOpen = false;
      failInventory = true; await page.locator('#inventoryBtn').click(); await page.locator('#inventoryList .async-retry-btn').waitFor(); failInventory = false; await page.locator('#inventoryList .async-retry-btn').click(); await page.locator('#inventoryList .reward-card').first().waitFor(); await page.locator('#closeInventoryBtn').click();
      await page.evaluate(() => switchTool('randomtank'));
      assert.equal(await page.locator('#wheelCanvas').count(), 0);
      await page.locator('#tankTier').selectOption('10'); await page.locator('#tankType').selectOption('heavy'); await page.locator('#tankNation').selectOption('ussr');
      assert.match(await page.locator('#tankPoolCount').textContent(), /4 辆/);
      await page.locator('#spinWheelBtn').click(); await page.locator('.tank-result').waitFor();
      const firstTank = await page.locator('.tank-result h4').textContent();
      assert.deepEqual(await page.locator('.tank-result-tags span').allTextContents(), ['X 级', '重型坦克', '苏联']);
      await page.locator('#excludeTankBtn').click(); await page.waitForFunction(name => document.querySelector('.tank-result h4')?.textContent !== name && document.querySelector('.tank-result h4'), firstTank);
      assert.match(await page.locator('#tankPoolCount').textContent(), /3 辆/);
      await screenshot('tank-result');
      if (width === 1440) assert.equal(await page.locator('.tank-result').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), true, 'Desktop result should fit in the first viewport');
      for (let i = 0; i < 3; i++) { await page.locator('#excludeTankBtn').click(); await page.waitForTimeout(40); }
      assert.equal(await page.locator('#spinWheelBtn').isDisabled(), true); assert.match(await page.locator('#tankPickStatus').textContent(), /没有可选坦克/);
      await page.locator('#restoreExcludedTanks').click(); assert.equal(await page.locator('#spinWheelBtn').isDisabled(), false);
      await page.locator('#resetTankFilters').click(); assert.equal(await page.locator('#tankTier').inputValue(), '');
      // Exercise the actual rolling animation and both skip paths in desktop dark mode.
      if (width === 1440 && theme === 'dark') {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.locator('#spinWheelBtn').click(); assert.equal(await page.locator('#tankTier').isDisabled(), true);
        await page.locator('#skipTankAnimation').click(); assert.equal(await page.locator('#tankTier').isDisabled(), false);
        await page.locator('#spinWheelBtn').click(); await page.waitForTimeout(100); await page.setViewportSize({ width: 1400, height: 960 }); await page.waitForFunction(() => !document.querySelector('#spinWheelBtn').disabled); await page.setViewportSize({ width, height: 960 });
        await page.evaluate(() => switchTool('chestsim')); await page.locator('#buyChestBtn').click(); await page.locator('#skipChestAnimation').waitFor({ state: 'visible' }); await page.locator('#skipChestAnimation').click(); await page.locator('#chestRewards').waitFor({ state: 'visible' }); await page.locator('#rewardDoneBtn').click();
        await page.locator('#buyChestBtn').click(); await page.locator('#chestRewards').waitFor({ state: 'visible' }); await page.locator('#rewardDoneBtn').click();
        failConfigs = true; await page.evaluate(() => GameTools.loadChests()); await page.locator('#chestGrid .async-retry-btn').waitFor(); failConfigs = false; await page.locator('#chestGrid .async-retry-btn').click(); await page.locator('.supply-chest-card').first().waitFor();
        await page.evaluate(() => { localStorage.setItem('token', ''); }); const before = opens; await page.locator('#buyChestBtn').click(); assert.equal(opens, before, 'Anonymous users cannot purchase');
      }
      assert.deepEqual(errors, []);
      console.log(`${theme} ${width}: supply selection, single purchase, rewards, inventory retry, filtered/excluded draw and unrelated panel parity passed`);
      await context.close();
    }
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
