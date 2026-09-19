'use strict';

const mode = process.argv[2];
const confirmation = '--confirm=B38-GAME-NEWS-ADDITIVE-MIGRATION';
if (!['--plan', '--apply'].includes(mode) || (mode === '--apply' && !process.argv.includes(confirmation))) {
  console.error(`Use --plan, or --apply ${confirmation}`);
  process.exitCode = 2;
} else {
  require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env'), quiet: true });
  (async () => {
    const conn = await require('mysql2/promise').createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    try {
      const result = await require('../lib/b38-game-news-migration').runMigration(conn, { apply: mode === '--apply' });
      result.forEach(item => console.log(`${item.name}: ${item.status}`));
    } finally {
      await conn.end();
    }
  })().catch(error => {
    console.error('B38 migration failed:', error.code || error.message);
    process.exitCode = 1;
  });
}
