'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', '..', 'public');

test('rental client loads before the website script and centralizes account requests', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(publicDir, 'script.js'), 'utf8');
  assert.match(html, /<script src="rental-client\.js"><\/script>\s*<script src="script\.js(?:\?[^" ]+)?"><\/script>/);
  for (const method of ['getHall', 'getAccount', 'getMyAccounts',
    'getAdminAccounts', 'reviewAccount', 'changeAccountStatus', 'changeAccountArchive']) {
    assert.match(script, new RegExp(`rentalClient\\.${method}\\(`));
  }
  assert.doesNotMatch(script, /JSON\.parse\((?:acc|account)\.screenshots\)/);
  assert.match(script, /const unitPrice = Number\(type === 'hour'/);
  assert.match(html, /id="refreshRentalHallBtn"/);
});

test('rental account publishing streams new files instead of converting them to Base64', () => {
  const script = fs.readFileSync(path.join(publicDir, 'script.js'), 'utf8');
  const client = fs.readFileSync(path.join(publicDir, 'rental-client.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'rental-accounts.js'), 'utf8');
  const publisher = script.slice(script.indexOf('// 发布出租：上传截图预览'),
    script.indexOf('// 我的租用订单'));
  assert.match(publisher, /rentalClient\.uploadScreenshot\(entry\.file, \{/);
  assert.match(publisher, /onProgress\(percent\)/);
  assert.match(publisher, /upload-retry-btn/);
  assert.doesNotMatch(publisher, /reader\.readAsDataURL\(file\)/);
  assert.match(client, /body: file/);
  const route = routes.slice(routes.indexOf("router.post('/rental/upload-screenshot'"),
    routes.indexOf("router.get('/rental/accounts'"));
  assert.match(route, /await saveRentalScreenshot/);
  assert.doesNotMatch(route, /writeFileSync/);
});
