'use strict';
const mode=process.argv[2];
const backup=process.argv.find(arg=>arg.startsWith('--backup='))?.slice(9);
if(!['--plan','--apply'].includes(mode)||(mode==='--apply'&&(!process.argv.includes('--confirm=REMOVE-LEAGUE-CONTENT')||!backup))){
  console.error('Use --plan, or --apply --confirm=REMOVE-LEAGUE-CONTENT --backup=<database.sql>');process.exitCode=2;
}else{
  (async()=>{
    const migration=require('../lib/b10-remove-league-migration');
    const backupVerified=mode==='--apply'?migration.verifyBackup(backup):false;
    require('dotenv').config({path:require('node:path').join(__dirname,'..','.env'),quiet:true});
    const conn=await require('mysql2/promise').createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
    try{for(const p of await migration.runMigration(conn,{apply:mode==='--apply',backupVerified}))console.log(`${p.name}: ${p.status} (${p.rows} rows)`);}
    finally{await conn.end();}
  })().catch(err=>{console.error('B10 removal failed:',err.code||err.message);process.exitCode=1;});
}
