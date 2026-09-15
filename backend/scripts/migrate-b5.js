'use strict';

const { runMigrations } = require('../lib/migration-runner');

const mode = process.argv[2];
if (!['--plan', '--apply'].includes(mode) ||
    (mode === '--apply' && !process.argv.includes('--confirm=B5-ADDITIVE-MIGRATION'))) {
  console.error('Use --plan, or --apply --confirm=B5-ADDITIVE-MIGRATION after separate production approval');
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
    (async () => {
      const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
      });
      try {
        const plan = await runMigrations(conn, { apply: mode === '--apply' });
        for (const item of plan) console.log(`${item.version}: ${item.status}`);
      } finally {
        await conn.end();
      }
    })().catch((err) => {
      console.error(`Migration failed: ${err.code || 'INTERNAL_ERROR'}`);
      process.exitCode = 1;
    });
  }
}
