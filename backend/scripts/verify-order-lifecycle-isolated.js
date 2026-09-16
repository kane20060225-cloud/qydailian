'use strict';
// Requires an explicit empty test database. Never loads the production .env.
const assert=require('node:assert/strict');
const mysql=require('mysql2/promise');
const {cancelUnpaid,resolveRecharge,timeoutCandidates,closeExpired}=require('../lib/order-lifecycle');
const {READ_MODEL_SQL,decorateOrder}=require('../lib/order-center');
const {changeRemoval}=require('../lib/order-cleanup');
const {recordOperation,postAccountDelta}=require('../lib/accounting');
const {processTrackedRecharge}=require('../lib/recharge-orders');
const database=process.argv.find(a=>a.startsWith('--database='))?.slice(11);
if(!/^qydailian_b14_test_[a-z0-9_]+$/.test(database||'')){console.error('Explicit empty --database=qydailian_b14_test_<suffix> required');process.exit(2);}
const REF='RC1700000000000B14TEST';
const sdk={exec:async(method,p,opts)=>{assert.equal(method,'alipay.trade.query');assert.equal(opts.validateSign,true);
  return {code:'10000',outTradeNo:p.bizContent.out_trade_no,tradeNo:'b14-synthetic-'+p.bizContent.out_trade_no,tradeStatus:'TRADE_SUCCESS',totalAmount:'6.00'};}};
(async()=>{
 const pool=mysql.createPool({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database,connectionLimit:8});
 try{
  assert.equal((await pool.execute('SELECT DATABASE() AS name'))[0][0].name,database);
  assert.equal(Number((await pool.execute('SELECT COUNT(*) AS total FROM users'))[0][0].total),0,'Requires an empty test database');
  const conn=await pool.getConnection();try{await require('../lib/b14-order-lifecycle-migration').runMigration(conn,{apply:true});}finally{conn.release();}
  await pool.execute("INSERT INTO users (id,username,password_hash,role,qy_credits,chest_tickets) VALUES (1,'b14-customer','synthetic','user',100,20),(2,'b14-admin','synthetic','admin',0,0),(3,'b14-owner','synthetic','user',0,0)");
  const deps={pool,recordOperation,actor:2,admin:true,reason:'isolated B14 verification'};
  const get=async(type,ref)=>{const [rows]=await pool.execute(READ_MODEL_SQL+' WHERE c.order_type=? AND c.order_ref=?',[type,ref]);assert.equal(rows.length,1);return rows[0];};
  const boost=async(ref)=>pool.execute("INSERT INTO orders (order_no,user_id,project,detail,quantity,player_name,price,total_price,status,payment_status,created_at) VALUES (?,1,'silver','synthetic',1,'test',6,6,'pending','unpaid',DATE_SUB(NOW(),INTERVAL 25 HOUR))",[ref]);
  await boost('B14-REFUND');
  const reservation=await pool.getConnection();try{await reservation.beginTransaction();await postAccountDelta(reservation,{userId:1,accountType:'qy_credits',delta:-50,entryKey:'order:B14-REFUND:credits_debit',sourceType:'order',sourceRef:'B14-REFUND'});await reservation.commit();}finally{reservation.release();}
  const cancellations=await Promise.all([cancelUnpaid({...deps,type:'boost',ref:'B14-REFUND'}),cancelUnpaid({...deps,type:'boost',ref:'B14-REFUND'})]);
  assert.equal(cancellations.filter(r=>r.already_closed).length,1);
  assert.equal((await pool.execute('SELECT qy_credits FROM users WHERE id=1'))[0][0].qy_credits,100);
  const closed=await get('boost','B14-REFUND');assert.equal(closed.state,'closed');assert.equal(decorateOrder(closed,1,false).actions.includes('boost_payment'),false);
  await changeRemoval({...deps,type:'boost',ref:'B14-REFUND'});assert.ok((await get('boost','B14-REFUND')).removed_at);
  assert.equal(Number((await pool.execute("SELECT COUNT(*) AS total FROM account_ledger WHERE source_type='order' AND source_ref='B14-REFUND'"))[0][0].total),2);
  for(let i=0;i<205;i++){const ref='B14-PROTECTED-'+i;await boost(ref);await pool.execute("INSERT INTO manual_payment_evidence (business_type,business_ref,uploader_user_id,filename,expected_amount) VALUES ('order',?,1,'synthetic.png',6)",[ref]);}
  await boost('B14-TIMEOUT');const preview=await timeoutCandidates(pool);assert.ok(preview.some(o=>o.ref==='B14-TIMEOUT'));assert.equal(preview.some(o=>o.ref.startsWith('B14-PROTECTED-')),false);
  assert.equal((await closeExpired(deps)).disabled,true);assert.equal((await closeExpired(deps,2,true)).closed,1);assert.equal((await get('boost','B14-TIMEOUT')).state,'closed');
  const [account]=await pool.execute("INSERT INTO rental_accounts (owner_id,client_type,status) VALUES (3,'Android','active')");
  await pool.execute("INSERT INTO rental_orders (order_no,renter_id,owner_id,account_id,rental_type,quantity,total_price,credits_used,status,created_at) VALUES ('B14-RENT-MISSING',1,3,?,'day',1,6,50,'pending',DATE_SUB(NOW(),INTERVAL 25 HOUR))",[account.insertId]);
  await assert.rejects(()=>cancelUnpaid({...deps,type:'rental',ref:'B14-RENT-MISSING'}),/缺少匹配流水/);
  assert.equal((await timeoutCandidates(pool)).some(o=>o.ref==='B14-RENT-MISSING'),false);
  const recharge=async(ref)=>pool.execute("INSERT INTO payment_orders (out_trade_no,user_id,amount,status) VALUES (?,1,6,'paid')",[ref]);
  await recharge(REF);assert.equal((await get('recharge',REF)).state,'exception');
  const review={...deps,confirmation:'REVIEWED_PAYMENT_AND_TICKETS',reference:'isolated synthetic records'};
  await resolveRecharge({...review,ref:REF,outcome:'historical_credited'});assert.equal((await get('recharge',REF)).state,'credited');
  assert.equal((await get('recharge',REF)).admin_task,null);
  assert.equal((await pool.execute('SELECT chest_tickets FROM users WHERE id=1'))[0][0].chest_tickets,20);
  assert.equal(Number((await pool.execute("SELECT COUNT(*) AS total FROM account_ledger WHERE source_type='payment_order' AND source_ref=?",[REF]))[0][0].total),0);
  const testRef='RC1700000000000B14CLOSED';await recharge(testRef);await resolveRecharge({...review,ref:testRef,outcome:'test_closed'});
  assert.equal((await get('recharge',testRef)).state,'closed');assert.equal((await get('recharge',testRef)).admin_task,null);
  await changeRemoval({...deps,type:'recharge',ref:testRef});assert.ok((await get('recharge',testRef)).removed_at);
  // A later verified success must expose an exception and invalidate its removal snapshot.
  await pool.execute("INSERT INTO recharge_order_workflow (out_trade_no,provider_status) VALUES (?,'TRADE_SUCCESS')",[testRef]);
  assert.equal((await get('recharge',testRef)).state,'exception');assert.equal((await get('recharge',testRef)).removed_at,null);
  const backfill='RC1700000000000B14BACKFILL';await recharge(backfill);
  const results=await Promise.allSettled([resolveRecharge({...review,ref:backfill,outcome:'tickets_backfilled',alipaySdk:sdk}),resolveRecharge({...review,ref:backfill,outcome:'tickets_backfilled',alipaySdk:sdk})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await get('recharge',backfill)).state,'credited');
  assert.equal((await pool.execute('SELECT chest_tickets FROM users WHERE id=1'))[0][0].chest_tickets,10020);
  await processTrackedRecharge({pool,notification:{out_trade_no:backfill,trade_no:'b14-synthetic-'+backfill,trade_status:'TRADE_SUCCESS',total_amount:'6.00',app_id:'b14-test-app',seller_id:'b14-test-seller'},expectedAppId:'b14-test-app',expectedSellerId:'b14-test-seller'});
  assert.equal((await pool.execute('SELECT chest_tickets FROM users WHERE id=1'))[0][0].chest_tickets,10020);
  const rollbackRef='RC1700000000000B14ROLLBACK';await recharge(rollbackRef);
  await assert.rejects(()=>resolveRecharge({...review,ref:rollbackRef,outcome:'tickets_backfilled',alipaySdk:sdk,recordOperation:async()=>{throw Error('injected audit failure');}}),/audit failure/);
  assert.equal((await get('recharge',rollbackRef)).state,'exception');assert.equal((await pool.execute('SELECT chest_tickets FROM users WHERE id=1'))[0][0].chest_tickets,10020);
  assert.equal(Number((await pool.execute('SELECT COUNT(*) AS total FROM recharge_order_resolutions WHERE out_trade_no=?',[rollbackRef]))[0][0].total),0);
  console.log('B14 isolated MySQL verification passed: concurrent refund/backfill, no fabricated history ledger, timeout exclusions before LIMIT, missing rental ledger protection, rollback, late payment visibility and duplicate notify.');
 }finally{await pool.end();}
})().catch(err=>{console.error('B14 isolated verification failed:',err.stack||err.message);process.exitCode=1;});
