'use strict';
const fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../migrations/20260917_b28_support.sql'),'utf8');
const mode=process.argv[2];
if(mode==='--plan')console.log(sql);
else if(mode==='--apply'){
 require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
 (async()=>{const db=await require('mysql2/promise').createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
 try{for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.query(statement);console.log('B28 support migration complete.');}finally{await db.end();}})().catch(e=>{console.error(e.code||'MIGRATION_FAILED');process.exitCode=1;});
}else{console.error('Use --plan or --apply');process.exitCode=2;}
