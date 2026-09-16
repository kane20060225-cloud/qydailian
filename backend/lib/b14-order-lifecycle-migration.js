'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const VERSION = '20260916_b14_order_lifecycle';
const SPECS = {
 recharge_order_resolutions:{columns:{out_trade_no:'varchar(64)',outcome:'varchar(30)',status_snapshot:'varchar(20)',trade_snapshot:'varchar(64)',reviewed_by:'int',reason:'varchar(500)',evidence_reference:'varchar(200)',reviewed_at:'datetime'},keys:{PRIMARY:['out_trade_no']}},
 order_lifecycle_settings:{columns:{id:'tinyint unsigned',timeout_enabled:'tinyint unsigned',updated_by:'int',updated_at:'datetime'},keys:{PRIMARY:['id']}}
};function loadMigration() {
  const sql = fs.readFileSync(path.join(__dirname,'..','migrations',VERSION+'.sql'),'utf8').replace(/\r\n/g,'\n');
  const statements = sql.split('\n').filter((line)=>!line.trimStart().startsWith('--')).join('\n')
    .split(';').map((s)=>s.trim()).filter(Boolean);
  const tables = statements.map((s)=>/^CREATE TABLE IF NOT EXISTS (\w+)\s*\(/i.exec(s)?.[1]);
  if (tables.join(',') !== Object.keys(SPECS).join(',')) throw new Error('B14 permits only the two reviewed additive tables');
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
      if (!columns.some((row)=>row.name===name && row.type.toLowerCase()===type)) throw new Error(`B14 schema conflict: ${table}.${name}`);
    }
    const [indexes] = await conn.execute(`SELECT INDEX_NAME AS name,SEQ_IN_INDEX AS position,COLUMN_NAME AS column_name,NON_UNIQUE AS non_unique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?`,[table]);
    for (const [name,keys] of Object.entries(spec.keys)) {
      const actual=indexes.filter((row)=>row.name===name).sort((a,b)=>Number(a.position)-Number(b.position));
      if (actual.map((row)=>row.column_name).join(',')!==keys.join(',') || ((name==='PRIMARY'||name.startsWith('uq_')) && actual.some((row)=>Number(row.non_unique)!==0))) throw new Error(`B14 index conflict: ${table}.${name}`);
    }
    plan.push({ name:table,status:'applied' });
  }
  return { plan,checksum:versions[0]?.checksum || null };
}

async function runMigration(conn,{ apply=false }={}) {
  const migration=loadMigration();
  const verify=(state)=> {
    if (state.checksum && state.checksum!==migration.checksum) throw new Error('B14 checksum mismatch');
    if (state.checksum && state.plan.some((item)=>item.status!=='applied')) throw new Error('B14 schema is incomplete');
  };
  if (!apply) { const state=await readSchema(conn); verify(state); return state.plan; }
  const [lock]=await conn.execute('SELECT GET_LOCK(?,10) AS acquired',['qydailian_b14_order_lifecycle']);
  if (Number(lock[0]?.acquired)!==1) throw new Error('Cannot acquire B14 migration lock');
  try {
    const before=await readSchema(conn); verify(before);
    for (const statement of migration.statements) await conn.query(statement);
    const after=await readSchema(conn); verify(after);
    if (after.plan.some((item)=>item.status!=='applied')) throw new Error('B14 verification failed');
    if (!before.checksum) await conn.execute('INSERT INTO schema_migrations (version,checksum) VALUES (?,?)',[VERSION,migration.checksum]);
    return after.plan;
  } finally { await conn.execute('SELECT RELEASE_LOCK(?)',['qydailian_b14_order_lifecycle']); }
}

module.exports={ loadMigration,runMigration,SPECS };

