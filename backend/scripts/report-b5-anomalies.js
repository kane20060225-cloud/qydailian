'use strict';

if (process.argv[2] !== '--report') {
  console.error('Read-only report requires --report');
  process.exitCode = 2;
} else {
  require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env'), quiet: true });
  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    console.error(`Missing database configuration names: ${missing.join(', ')}`);
    process.exitCode = 2;
  } else {
    const mysql = require('mysql2/promise');
    const { b5AnomalyReport } = require('../lib/b5-anomaly-report');
    (async () => {
      const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
      });
      try {
        await conn.query('START TRANSACTION READ ONLY');
        const report = await b5AnomalyReport(conn);
        await conn.commit();
        for (const [label, count] of Object.entries(report)) console.log(`${label}: ${count}`);
      } finally { await conn.end(); }
    })().catch((err) => {
      console.error(`Read-only report failed: ${err.code || 'INTERNAL_ERROR'}`);
      process.exitCode = 1;
    });
  }
}
