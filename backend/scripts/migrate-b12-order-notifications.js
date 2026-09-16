'use strict';
const mode=process.argv[2];
if (!['--plan','--apply'].includes(mode) || (mode==='--apply' && !process.argv.includes('--confirm=B12-ORDER-NOTIFICATIONS-ADDITIVE-MIGRATION'))) {
  console.error('Use --plan, or --apply --confirm=B12-ORDER-NOTIFICATIONS-ADDITIVE-MIGRATION after reviewing the additive migration');
  process.exitCode=2;
} else {
  require('dotenv').config({ path:require('node:path').join(__dirname,'..','.env'),quiet:true });
  (async()=> {
    const conn=await require('mysql2/promise').createConnection({ host:process.env.DB_HOST,
      port:Number(process.env.DB_PORT || 3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME });
    try { for (const item of await require('../lib/b12-order-notifications-migration').runMigration(conn,{ apply:mode==='--apply' })) console.log(`${item.name}: ${item.status}`); }
    finally { await conn.end(); }
  })().catch((err)=> { console.error('B12 migration failed:',err.code || err.message); process.exitCode=1; });
}
