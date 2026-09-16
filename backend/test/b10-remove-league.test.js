'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');
const {TABLES,runMigration,verifyBackup,loadMigration}=require('../lib/b10-remove-league-migration');
function fake(){
  const state={tables:new Set([...TABLES,'users','orders']),checksum:null,ddl:[],refs:[],locked:false,failTable:null};
  const conn={execute:async(sql,p=[])=>{
    if(sql.startsWith('SELECT checksum'))return [state.checksum?[{checksum:state.checksum}]:[]];
    if(sql.includes('information_schema.tables'))return [Array.from(state.tables).filter(name=>name.startsWith('league_')).map(name=>({name}))];
    if(sql.includes('KEY_COLUMN_USAGE'))return [state.refs];
    if(sql.startsWith('SELECT COUNT(*)'))return [[{total:2}]];
    if(sql.startsWith('SELECT GET_LOCK')){state.locked=true;return [[{acquired:1}]];}
    if(sql.startsWith('SELECT RELEASE_LOCK')){state.locked=false;return [[]];}
    if(sql.startsWith('INSERT INTO schema_migrations')){state.checksum=p[1];return [{}];}
    throw Error(sql);
  },query:async sql=>{
    assert.match(sql,/^DROP TABLE IF EXISTS league_/);const table=sql.split(' ').at(-1);if(state.failTable===table)throw Error('synthetic DDL failure');
    if(['league_seasons','league_teams'].includes(table))assert.equal(state.tables.has('league_scores'),false);
    if(table==='league_seasons')assert.equal(state.tables.has('league_points_rules'),false);
    state.ddl.push(table);state.tables.delete(table);return [{}];
  }};return {state,conn};
}
test('league removal plan does not mutate data, apply drops only approved tables after backup',async()=>{
  const {state,conn}=fake();const plan=await runMigration(conn);assert.equal(plan.length,5);assert.equal(state.ddl.length,0);
  await assert.rejects(()=>runMigration(conn,{apply:true}),/verified backup/);assert.equal(state.ddl.length,0);
  await runMigration(conn,{apply:true,backupVerified:true});assert.deepEqual(state.ddl,[...TABLES]);assert.deepEqual([...state.tables],['users','orders']);assert.equal(state.checksum,loadMigration().checksum);assert.equal(state.locked,false);
  await runMigration(conn,{apply:true,backupVerified:true});assert.equal(state.ddl.length,5);
});
test('external business references and unreviewed tables block league data deletion',async()=>{
  const {state,conn}=fake();state.refs=[{name:'orders',referenced_name:'league_seasons'}];await assert.rejects(()=>runMigration(conn,{apply:true,backupVerified:true}),/different business/);assert.equal(state.ddl.length,0);assert.equal(state.locked,false);
  state.refs=[];state.tables.add('league_extra');await assert.rejects(()=>runMigration(conn,{apply:true,backupVerified:true}),/Unrecognized/);assert.equal(state.ddl.length,0);
});
test('partially completed DDL can retry safely and recreated tables fail verification',async()=>{
  const {state,conn}=fake();state.failTable='league_seasons';await assert.rejects(()=>runMigration(conn,{apply:true,backupVerified:true}),/synthetic/);assert.equal(state.checksum,null);assert.equal(state.locked,false);
  state.failTable=null;await runMigration(conn,{apply:true,backupVerified:true});assert.deepEqual(state.ddl,[...TABLES]);
  state.tables.add('league_news');await assert.rejects(()=>runMigration(conn),/recreated/);
});
test('backup verification and CLI refuse incomplete or implicit removal',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'b10-backup-'));const backup=path.join(dir,'database.sql');t.after(()=>{fs.unlinkSync(backup);fs.rmdirSync(dir);});
  fs.writeFileSync(backup,'CREATE TABLE `users` ();');assert.throws(()=>verifyBackup(backup),/five league/);
  fs.writeFileSync(backup,TABLES.map(name=>'CREATE TABLE `'+name+'` ();').join('\n'));assert.equal(verifyBackup(backup),true);
  for(const args of [[],['--apply'],['--apply','--confirm=WRONG']])assert.equal(spawnSync(process.execPath,[path.join(__dirname,'..','scripts','migrate-b10-remove-league.js'),...args],{encoding:'utf8'}).status,2);
});
