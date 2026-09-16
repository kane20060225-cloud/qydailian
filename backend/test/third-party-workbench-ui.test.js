'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'script.js'), 'utf8');
const style = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'style.css'), 'utf8');

test('clicking the third-party menu button opens its section exactly once', () => {
  const calls = [];
  const listeners = [];
  const button = { addEventListener(type, handler) { if (type === 'click') listeners.push(handler); } };
  const navigation = script.split('// ==================== 板块切换 ====================')[1]
    .split('function showSection(target)')[0];
  vm.runInNewContext(navigation, {
    document: { querySelectorAll: () => [] },
    getEl: (id) => id === 'thirdPartyOrdersBtn' ? button : null,
    profileBtn: null, adminPanelBtn: null, boosterPanelBtn: null,
    showSection: (target) => calls.push(target)
  });
  for (const listener of listeners) listener();
  assert.deepEqual(calls, ['thirdparty']);
});

test('third-party workbench uses game server sources and task filters', () => {
  for (const label of ['安卓官服', 'iOS官服', '亚服', '安卓渠道服']) assert.match(page, new RegExp(label));
  assert.doesNotMatch(page, /闲鱼|贴吧|微信\.\.\./);
  for (const filter of ['todo', 'pending', 'in_progress', 'awaiting_acceptance', 'completed', 'rejected']) {
    assert.match(page, new RegExp(`data-filter="${filter}"`));
  }
});

test('third-party workbench renders cards on desktop and one column on mobile', () => {
  assert.match(script, /tp-order-card/);
  assert.match(script, /tpMaskAccount/);
  assert.match(script, /request-complete/);
  assert.match(script, /return-completion/);
  assert.match(style, /\.tp-order-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
  assert.match(style, /@media \(max-width: 760px\)[\s\S]*\.tp-form-grid, \.tp-order-grid, \.tp-detail-grid \{ grid-template-columns: 1fr/);
});
