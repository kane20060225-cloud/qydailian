'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { REPORT_QUERIES, b5AnomalyReport } = require('../lib/b5-anomaly-report');

test('B5 historical report uses only aggregate SELECT queries', async () => {
  const calls = [];
  const conn = {
    async execute(sql) {
      calls.push(sql);
      return [[{ count: 4 }]];
    }
  };
  const report = await b5AnomalyReport(conn);
  assert.equal(Object.keys(report).length, Object.keys(REPORT_QUERIES).length);
  assert.ok(Object.values(report).every((count) => count === 4));
  assert.ok(calls.every((sql) => /^SELECT COUNT\(\*\)/.test(sql)));
  assert.ok(calls.every((sql) => !/\b(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/i.test(sql)));
});

test('B5 report CLI refuses an implicit production connection', () => {
  const run = spawnSync(process.execPath, ['scripts/report-b5-anomalies.js'], {
    cwd: require('node:path').join(__dirname, '..'), encoding: 'utf8',
    env: { PATH: process.env.PATH }
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /requires --report/);
});
