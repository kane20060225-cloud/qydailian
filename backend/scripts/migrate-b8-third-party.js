'use strict';

const mode = process.argv[2];
const confirm = '--confirm=B8-THIRD-PARTY-ADDITIVE-MIGRATION';
if (!['--plan', '--apply'].includes(mode) || (mode === '--apply' && !process.argv.includes(confirm))) {
  console.error(`Use --plan, or --apply ${confirm} after reviewing the additive migration`);
  process.exitCode = 2;
} else {
  require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env'), quiet: true });
  const mysql = require('mysql2/promise');
  const { runB8Migration } = require('../lib/b8-third-party-migration');
  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    console.error(`Missing database configuration names: ${missing.join(', ')}`);
    process.exitCode = 2;
  } else {
    (async () => {
      const conn = await mysql.createConnection({
        host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME
      });
      try {
        const plan = await runB8Migration(conn, { apply: mode === '--apply' });
        for (const item of plan) console.log(`${item.name}: ${item.status}`);
      } finally { await conn.end(); }
    })().catch((err) => {
      console.error(`B8 migration failed: ${err.code || err.message}`);
      process.exitCode = 1;
    });
  }
}
