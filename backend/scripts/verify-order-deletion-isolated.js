'use strict';
// Explicit empty synthetic database only. Never reads a production .env.
const assert=require('node:assert/strict'),mysql=require('mysql2/promise');
const {runMigration}=require('../lib/b16-order-deletion-migration');
const {requestDeletion,reviewDeletion}=require('../lib/order-deletion');
const {READ_MODEL_SQL,parseFilters,filterClause,sortClause}=require('../lib/order-center');
const {purgeExpiredTrash}=require('../lib/order-cleanup');
const {recordOperation}=require('../lib/accounting');
const {METRICS_SQL}=require('../lib/order-metrics');
const database=process.argv.find(a=>a.startsWith('--database='))?.slice(11);
if(!/^qydailian_b16_test_[a-z0-9_]+$/.test(database||'')){console.error('Explicit --database=qydailian_b16_test_<suffix> required');process.exit(2);}
(async()=>{
 const pool=mysql.createPool({host:process.env.DB_HOST||'127.0.0.1',user:process.env.DB_USER,password:process.env.DB_PASSWORD,database,connectionLimit:8});
 try{
  assert.equal((await pool.execute('SELECT DATABASE() AS name'))[0][0].name,database);assert.equal(Number((await pool.execute('SELECT COUNT(*) AS total FROM users'))[0][0].total),0);
  const c=await pool.getConnection();try{await runMigration(c,{apply:true});}finally{c.release();}
  await pool.execute("INSERT INTO users (id,username,password_hash,role) VALUES (1,'b16-booster','synthetic','booster'),(2,'b16-admin','synthetic','admin'),(3,'b16-customer','synthetic','user')");
  const tp=async ref=>pool.execute("INSERT INTO third_party_orders (order_no,creator_id,platform,content,account_info,price,status,payment_status) VALUES (?,1,'安卓官服','synthetic','synthetic',8,'approved','unpaid')",[ref]);
  const get=async(type,ref)=>(await pool.execute(READ_MODEL_SQL+' WHERE c.order_type=? AND c.order_ref=?',[type,ref]))[0][0];
  const deps={pool,recordOperation,type:'third_party',ref:'B16-DUPLICATE',actor:1,role:'booster',reason:'isolated duplicate'};
  const review={...deps,actor:2,decision:'approve',reason:'isolated reviewed duplicate',reference:'synthetic valid order',confirmation:'REVIEWED_REMOVAL_RETAINS_ALL_RECORDS',expectedState:'in_progress',expectedPayment:'unpaid'};
  await tp(deps.ref);const attempts=await Promise.all([requestDeletion(deps),requestDeletion(deps)]);assert.equal(attempts.filter(r=>r.already_requested).length,1);
  const filters=parseFilters({task:'deletion',state:'todo'}),where=filterClause(filters,{admin:true,userId:2,role:'admin'});
  assert.equal((await pool.execute(READ_MODEL_SQL+where.sql+sortClause(filters,true)+' LIMIT 25',where.params))[0].length,1);
  await reviewDeletion(review);assert.ok((await get('third_party',deps.ref)).removed_at);assert.equal((await get('third_party',deps.ref)).retention_protected,1);
  assert.equal((await pool.execute('SELECT status,payment_status FROM third_party_orders WHERE order_no=?',[deps.ref]))[0][0].status,'approved');
  await pool.execute("UPDATE third_party_orders SET status='pending' WHERE order_no=?",[deps.ref]);
  assert.equal((await get('third_party',deps.ref)).removed_at,null,'source changes invalidate old snapshot');
  await pool.execute("UPDATE order_removals SET state_snapshot='pending',removed_at=DATE_SUB(NOW(),INTERVAL 15 DAY) WHERE order_ref=?",[deps.ref]);
  assert.equal((await purgeExpiredTrash({pool,recordOperation})).purged,0);assert.ok(await get('third_party',deps.ref));
  await tp('B16-REJECT');await requestDeletion({...deps,ref:'B16-REJECT'});await reviewDeletion({...review,ref:'B16-REJECT',decision:'reject'});assert.equal((await get('third_party','B16-REJECT')).deletion_status,'rejected');assert.equal((await get('third_party','B16-REJECT')).removed_at,null);
  await requestDeletion({...deps,ref:'B16-REJECT'});await assert.rejects(()=>reviewDeletion({...review,ref:'B16-REJECT',recordOperation:async()=>{throw Error('synthetic audit failure');}}),/audit failure/);assert.equal((await get('third_party','B16-REJECT')).deletion_status,'pending');assert.equal((await get('third_party','B16-REJECT')).removed_at,null);
  await pool.execute("INSERT INTO orders (order_no,user_id,project,detail,quantity,player_name,price,total_price,status,payment_status,hall_status,booster_id) VALUES ('B16-HISTORICAL',3,'silver','synthetic',1,'synthetic',7.8,7.8,'playing','unpaid','taken',1)");
  await reviewDeletion({...review,type:'boost',ref:'B16-HISTORICAL',decision:'remove',expectedState:'exception'});const raw=(await pool.execute("SELECT status,payment_status,hall_status,booster_id FROM orders WHERE order_no='B16-HISTORICAL'"))[0][0];assert.deepEqual({...raw},{status:'playing',payment_status:'unpaid',hall_status:'taken',booster_id:1});assert.equal((await get('boost','B16-HISTORICAL')).retention_protected,1);
  await pool.execute(METRICS_SQL);assert.equal(Number((await pool.execute('SELECT COUNT(*) AS total FROM account_ledger'))[0][0].total),0);
  console.log('B16 isolated MySQL verification passed: concurrent applications, scoped priority queries, approval/rejection, rollback, original state preservation, retained records, snapshot invalidation and B15 metrics.');
 }finally{await pool.end();}
})().catch(err=>{console.error('B16 isolated verification failed:',err.code||err.message);process.exitCode=1;});
