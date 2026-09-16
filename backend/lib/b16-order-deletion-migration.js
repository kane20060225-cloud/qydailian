'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const VERSION = '20260916_b16_order_deletion';
const SPECS = {order_deletion_requests:{columns:{order_type:'varchar(20)',order_ref:'varchar(64)',requester_user_id:'int',reason:'varchar(500)',status:'varchar(20)',state_snapshot:'varchar(40)',payment_snapshot:'varchar(30)',reviewed_by:'int',review_note:'varchar(500)',evidence_reference:'varchar(200)',reviewed_at:'datetime',retain_records:'tinyint unsigned',created_at:'datetime',updated_at:'datetime'},keys:{PRIMARY:['order_type','order_ref'],idx_order_deletion_pending:['status','created_at']}}};function loadMigration() {
  const sql = fs.readFileSync(path.join(__dirname,'..','migrations',VERSION+'.sql'),'utf8').replace(/\r\n/g,'\n');
  const statements = sql.split('\n').filter((line)=>!line.trimStart().startsWith('--')).join('\n')
    .split(';').map((s)=>s.trim()).filter(Boolean);
  const tables = statements.map((s)=>/^CREATE TABLE IF NOT EXISTS (\w+)\s*\(/i.exec(s)?.[1]);
  if (tables.join(',') !== Object.keys(SPECS).join(',')) throw new Error('B16 permits only the reviewed additive metadata table');
  return { statements,checksum:crypto.createHash('sha256').update(sql).digest('hex') };
}

async function readSchema(conn) {
  const [versionTables] = await conn.execute(`SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='schema_migrations'`);
  if (Number(versionTables[0]?.total)!==1) throw new Error('B5 schema_migrations is required');
  const [versions] = await conn.execute('SELECT checksum FROM schema_migrations WHERE version=?',[VERSION]);
  const plan=[];
  for (const [table,spec] of Object.entries(SPECS)) {
    const [columns] = await conn.execute(`SELECT COLUMN_NAME AS name,COLUMN_TYPE AS type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?`,[table]);
    if (!columns.length) { plan.push({ name:table,status:'pending' }); continue; }
    for (const [name,type] of Object.entries(spec.columns)) {
      if (!columns.some((row)=>row.name===name && row.type.toLowerCase()===type)) throw new Error(`B16 schema conflict: ${table}.${name}`);
    }
    const [indexes] = await conn.execute(`SELECT INDEX_NAME AS name,SEQ_IN_INDEX AS position,COLUMN_NAME AS column_name,NON_UNIQUE AS non_unique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?`,[table]);
    for (const [name,keys] of Object.entries(spec.keys)) {
      const actual=indexes.filter((row)=>row.name===name).sort((a,b)=>Number(a.position)-Number(b.position));
      if (actual.map((row)=>row.column_name).join(',')!==keys.join(',') || ((name==='PRIMARY'||name.startsWith('uq_')) && actual.some((row)=>Number(row.non_unique)!==0))) throw new Error(`B16 index conflict: ${table}.${name}`);
    }
    plan.push({ name:table,status:'applied' });
  }
  return { plan,checksum:versions[0]?.checksum || null };
}

async function runMigration(conn,{ apply=false }={}) {
  const migration=loadMigration();
  const verify=(state)=> {
    if (state.checksum && state.checksum!==migration.checksum) throw new Error('B16 checksum mismatch');
    if (state.checksum && state.plan.some((item)=>item.status!=='applied')) throw new Error('B16 schema is incomplete');
  };
  if (!apply) { const state=await readSchema(conn); verify(state); return state.plan; }
  const [lock]=await conn.execute('SELECT GET_LOCK(?,10) AS acquired',['qydailian_b16_order_deletion']);
  if (Number(lock[0]?.acquired)!==1) throw new Error('Cannot acquire B16 migration lock');
  try {
    const before=await readSchema(conn); verify(before);
    for (const statement of migration.statements) await conn.query(statement);
    const after=await readSchema(conn); verify(after);
    if (after.plan.some((item)=>item.status!=='applied')) throw new Error('B16 verification failed');
    if (!before.checksum) await conn.execute('INSERT INTO schema_migrations (version,checksum) VALUES (?,?)',[VERSION,migration.checksum]);
    return after.plan;
  } finally { await conn.execute('SELECT RELEASE_LOCK(?)',['qydailian_b16_order_deletion']); }
}

module.exports={ loadMigration,runMigration,SPECS };

