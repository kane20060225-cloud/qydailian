'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');const path=require('node:path');
const {loadMigration,runMigration,SPECS}=require('../lib/b9-order-center-migration');
test('B9 plan is read only, apply is additive and detects schema conflicts',async()=>{
  const tables=new Set();let checksum=null,ddl=0,locked=false,conflict=false;
  const conn={execute:async(sql,p=[])=>{
    if(sql.includes('information_schema.tables'))return [[{total:1}]];
    if(sql.startsWith('SELECT checksum'))return [checksum?[{checksum}]:[]];
    if(sql.includes('information_schema.columns'))return [tables.has(p[0])?Object.entries(SPECS[p[0]].columns).map(([name,type])=>({name,type:conflict?'varchar(1)':type})):[]];
    if(sql.includes('information_schema.statistics'))return [Object.entries(SPECS[p[0]].keys).flatMap(([name,columns])=>columns.map((column_name,i)=>({name,column_name,position:i+1,non_unique:name==='PRIMARY'?0:1})))];
    if(sql.startsWith('SELECT GET_LOCK')){locked=true;return [[{acquired:1}]];}
    if(sql.startsWith('SELECT RELEASE_LOCK')){locked=false;return [[]];}
    if(sql.startsWith('INSERT INTO schema_migrations')){checksum=p[1];return [{}];}
    throw Error(sql);
  },query:async sql=>{assert.match(sql,/^CREATE TABLE IF NOT EXISTS/);tables.add(/^CREATE TABLE IF NOT EXISTS (\w+)/.exec(sql)[1]);ddl++;}};
  assert.equal((await runMigration(conn)).every(p=>p.status==='pending'),true);assert.equal(ddl,0);
  await runMigration(conn,{apply:true});assert.equal(ddl,3);assert.equal(checksum,loadMigration().checksum);assert.equal(locked,false);
  await runMigration(conn,{apply:true});assert.equal(tables.size,3);assert.equal(locked,false);
  conflict=true;await assert.rejects(()=>runMigration(conn,{apply:true}),/schema conflict/);assert.equal(locked,false);
});
test('B9 CLI rejects implicit connection and wrong confirmation',()=>{
  const cli=path.join(__dirname,'..','scripts','migrate-b9-order-center.js');
  for(const args of [[],['--apply','--confirm=wrong']]){const result=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});assert.equal(result.status,2);}
});
