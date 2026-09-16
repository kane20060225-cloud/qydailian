'use strict';
const mode=process.argv[2];
if(!['--plan','--apply'].includes(mode)||(mode==='--apply'&&!process.argv.includes('--confirm=B14-ORDER-LIFECYCLE-ADDITIVE-MIGRATION'))){
 console.error('Use --plan, or --apply --confirm=B14-ORDER-LIFECYCLE-ADDITIVE-MIGRATION');process.exitCode=2;
}else{
 require('dotenv').config({path:require('node:path').join(__dirname,'..','.env'),quiet:true});
 (async()=>{const conn=await require('mysql2/promise').createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
 try{for(const item of await require('../lib/b14-order-lifecycle-migration').runMigration(conn,{apply:mode==='--apply'}))console.log(`${item.name}: ${item.status}`);}finally{await conn.end();}
 })().catch(err=>{console.error('B14 migration failed:',err.code||err.message);process.exitCode=1;});
}

