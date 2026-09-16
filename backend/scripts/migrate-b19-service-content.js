'use strict';
const mode=process.argv[2];
if(!['--plan','--apply'].includes(mode)){console.error('Use --plan or --apply');process.exitCode=2;}
else if(mode==='--plan')console.log('B19: add site_service_content and seed the existing seven projects only when missing; no order changes.');
else{require('dotenv').config({path:require('node:path').join(__dirname,'../.env'),quiet:true});(async()=>{const db=await require('mysql2/promise').createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});try{await require('../lib/service-content').initialize(db);console.log('B19 service content initialized; existing configuration preserved.');}finally{await db.end();}})().catch(e=>{console.error('B19 migration failed:',e.code||'INTERNAL_ERROR');process.exitCode=1;});}
