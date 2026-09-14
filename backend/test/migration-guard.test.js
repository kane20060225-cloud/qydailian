'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

const migrationScript = path.join(__dirname, '..', 'scripts', 'encrypt-legacy-credentials.js');

test('migration script refuses to run without an explicit mode', () => {
  const result = spawnSync(process.execPath, [migrationScript], {
    encoding: 'utf8',
    env: {}
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /默认不会连接数据库/);
});

test('apply mode requires a separate confirmation value', () => {
  const result = spawnSync(process.execPath, [migrationScript, '--apply'], {
    encoding: 'utf8',
    env: {}
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /执行迁移前必须设置/);
});
