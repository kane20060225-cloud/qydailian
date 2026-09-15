'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', '..', 'public');

test('rental admin tab exposes application review and keeps order review together', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(publicDir, 'script.js'), 'utf8');
  for (const id of ['adminRentalSection', 'adminRentalAccountList',
    'adminRentalAccountStatus', 'adminRentalOrderList', 'adminRentalPageInfo']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(script, new RegExp(id));
  }
  assert.match(html, /data-admintab="rental"/);
  assert.match(script, /\/admin\/rental\/accounts\?/);
  assert.match(script, /\/admin\/rental\/accounts\/\$\{id\}\/review/);
});

test('owner UI requests re-review instead of offering self-activation', () => {
  const script = fs.readFileSync(path.join(publicDir, 'script.js'), 'utf8');
  assert.match(script, /data-status="pending">申请重新审核/);
  assert.doesNotMatch(script, /data-status="active">上架/);
  assert.match(script, /待管理员审核/);
});

test('rental account deletion is a recoverable archive action in both owner and admin UI', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(publicDir, 'script.js'), 'utf8');
  assert.match(html, /id="myRentalDeletedList"/);
  assert.match(html, /<option value="deleted">已删除<\/option>/);
  assert.match(script, /admin-rental-account-archive-btn/);
  assert.match(script, /rental-account-archive-btn/);
  assert.match(script, /恢复为待审核/);
  assert.match(script, /历史租单(?:会)?保留/);
  assert.match(script, /\/rental\/accounts\/\$\{id\}\/\$\{action\}`,\s*\{\s*method: 'POST'/);
});
