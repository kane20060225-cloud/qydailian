'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { rentalTimelineHtml, rentalTimelineSteps } = require('../../public/ui-runtime.js');

const publicDir = path.join(__dirname, '..', '..', 'public');

test('rental timeline uses one status model for payment, dispute and completion', () => {
  assert.deepEqual(rentalTimelineSteps({ total_price: 10, payment_status: 'submitted' })
    .map(step => step.label), ['订单已创建', '付款凭证待人工核实']);
  const completed = rentalTimelineSteps({ payment_status: 'paid', status: 'completed',
    owner_complete_requested_at: '2026-09-16' });
  assert.equal(completed.at(-1).label, '订单已完成并结算');
  assert.match(rentalTimelineHtml({ payment_status: 'rejected' }), /订单处理进度/);
  assert.match(rentalTimelineHtml({ payment_status: 'rejected' }), /付款凭证未通过/);
});

test('B7 runtime is loaded before feature scripts and exposes accessible states', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(publicDir, 'script.js'), 'utf8');
  const css = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8');
  assert.match(html, /ui-runtime\.js[\s\S]*rental-client\.js[\s\S]*script\.js/);
  assert.match(script, /UIRuntime\.enhanceModals/);
  assert.match(script, /UIRuntime\.renderAsyncState/);
  assert.match(script, /UIRuntime\.rentalTimelineHtml/);
  assert.match(css, /\.async-state/);
  assert.match(css, /\.order-timeline/);
  const runtime = fs.readFileSync(path.join(publicDir, 'ui-runtime.js'), 'utf8');
  assert.match(runtime, /aria-modal/);
  assert.match(runtime, /event\.key === 'Escape'/);
  assert.match(runtime, /event\.key === 'Tab'/);
});

test('language settings do not advertise an unimplemented English UI', () => {
  const script = fs.readFileSync(path.join(publicDir, 'script.js'), 'utf8');
  const language = script.slice(script.indexOf('function renderLanguage()'),
    script.indexOf('// 站内邮箱'));
  assert.match(language, /当前仅提供简体中文/);
  assert.doesNotMatch(language, /value="en"/);
});

test('B7 upload, mobile table and theme cleanup stay wired into the page', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(publicDir, 'script.js'), 'utf8');
  const css = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8');
  assert.match(html, /单张不超过 5MB，最多 3 张/);
  assert.match(html, /id="rentalUploadQueue"[^>]+aria-live="polite"/);
  assert.match(script, /onProgress\(percent\)/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.responsive-table/);
  assert.equal((css.match(/#adminCustomList table\s*\{/g) || []).length, 1);
  assert.equal((css.match(/background-image:\s*url\('bg\.png'\)/g) || []).length, 1);
});
