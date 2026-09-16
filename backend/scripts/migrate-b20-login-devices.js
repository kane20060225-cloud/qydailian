'use strict';
const mode=process.argv[2];
if(!['--plan','--apply'].includes(mode)){console.error('Use --plan or --apply');process.exitCode=2;}
else if(mode==='--plan')console.log('B20: add nullable device_key and unique(user_id,device_key); preserve all historical login records.');
else{require('dotenv').config({path:require('node:path').join(__dirname,'../.env'),quiet:true});(async()=>{const db=await require('mysql2/promise').createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});try{await require('../lib/login-devices').initialize(db);console.log('B20 login-device migration complete; history preserved.');}finally{await db.end();}})().catch(e=>{console.error('B20 migration failed:',e.code||'INTERNAL_ERROR');process.exitCode=1;});}
