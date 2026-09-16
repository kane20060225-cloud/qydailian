'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const VERSION='20260916_b10_remove_league';
const TABLES=Object.freeze(['league_scores','league_points_rules','league_seasons','league_teams','league_news']);
function loadMigration(){
  const sql=fs.readFileSync(path.join(__dirname,'..','migrations',VERSION+'.sql'),'utf8').replace(/\r\n/g,'\n');
  const statements=sql.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n').split(';').map(s=>s.trim()).filter(Boolean);
  if(statements.join(';')!==TABLES.map(table=>'DROP TABLE IF EXISTS '+table).join(';'))throw Error('B10 permits only the five reviewed league tables');
  return {statements,checksum:crypto.createHash('sha256').update(sql).digest('hex')};
}
function verifyBackup(filename){
  if(!filename||!fs.statSync(filename).isFile()||fs.statSync(filename).size===0)throw Error('A nonempty database backup is required');
  const sql=fs.readFileSync(filename,'utf8');
  if(TABLES.some(table=>!sql.includes('CREATE TABLE `'+table+'`')))throw Error('Backup must contain the five league table definitions');
  return true;
}
async function planMigration(conn){
  const [versions]=await conn.execute('SELECT checksum FROM schema_migrations WHERE version=?',[VERSION]);
  const [tables]=await conn.execute("SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND LEFT(table_name,7)='league_'");
  if(tables.some(t=>!TABLES.includes(t.name)))throw Error('Unrecognized league table: review required');
  const [references]=await conn.execute(`SELECT TABLE_NAME AS name,REFERENCED_TABLE_NAME AS referenced_name FROM information_schema.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IN (?,?,?,?,?)`,TABLES);
  if(references.some(r=>!TABLES.includes(r.name)))throw Error('A different business table references league data; refusing to drop');
  const plan=[];
  for(const table of TABLES){
    const exists=tables.some(t=>t.name===table);
    const [rows]=exists?await conn.execute(`SELECT COUNT(*) AS total FROM ${table}`):[[{total:0}]];
    plan.push({name:table,status:exists?'pending':'removed',rows:Number(rows[0].total)});
  }
  const checksum=versions[0]?.checksum;
  if(checksum&&checksum!==loadMigration().checksum)throw Error('B10 checksum mismatch');
  if(checksum&&tables.length)throw Error('Retired league tables were recreated');
  return {plan,checksum};
}
async function runMigration(conn,{apply=false,backupVerified=false}={}){
  if(!apply)return (await planMigration(conn)).plan;
  if(!backupVerified)throw Error('A verified backup is required before league removal');
  const [[lock]]=await conn.execute('SELECT GET_LOCK(?,10) AS acquired',['qydailian_b10_remove_league']);
  if(Number(lock.acquired)!==1)throw Error('Cannot acquire B10 migration lock');
  try{
    const before=await planMigration(conn);const migration=loadMigration();
    for(let i=0;i<TABLES.length;i++)if(before.plan[i].status==='pending')await conn.query(migration.statements[i]);
    const after=await planMigration(conn);
    if(after.plan.some(p=>p.status!=='removed'))throw Error('League removal verification failed');
    if(!before.checksum)await conn.execute('INSERT INTO schema_migrations (version,checksum) VALUES (?,?)',[VERSION,migration.checksum]);
    return after.plan;
  }finally{await conn.execute('SELECT RELEASE_LOCK(?)',['qydailian_b10_remove_league']);}
}
module.exports={TABLES,loadMigration,verifyBackup,runMigration};
