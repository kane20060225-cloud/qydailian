'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {parseFilters,filterClause,decorateOrder,csvCell}=require('../lib/order-center');
const {createOrderCenterRouter}=require('../routes/order-center');
const {paymentFormParams,canResumeRecharge,createRechargeOrder,refreshRecharge}=require('../lib/recharge-orders');

test('order search remains parameterized, permission scoped and date inclusive',()=>{
  const filters=parseFilters({search:"%' OR 1=1 --",from:'2026-09-01',to:'2026-09-16',page:'2'});
  const where=filterClause(filters,{admin:false,userId:7,role:'user'});
  assert.match(where.sql,/customer_id=\? OR c.related_user_id=\?/);
  assert.match(where.sql,/order_type!='third_party'/);
  assert.match(where.sql,/DATE_ADD\(\?,INTERVAL 1 DAY\)/);
  assert.equal(where.sql.includes('OR 1=1'),false);
  assert.deepEqual(where.params.slice(0,2),[7,7]);
  assert.ok(where.params[2].startsWith('%\\%'));
  for(const query of [{page:'1 OR 1=1'},{page:'0'},{from:'2026-02-30'},{from:'2026-09-17',to:'2026-09-16'},{type:'users'}])assert.throws(()=>parseFilters(query));
});
test('recharge actions prohibit repaying provider success and never offer manual credit for historic paid records',()=>{
  const pending={order_type:'recharge',customer_id:7,state:'pending_payment',business_status:'pending'};
  assert.deepEqual(decorateOrder(pending,7,false).actions,['pay','refresh']);
  assert.equal(decorateOrder({...pending,state:'credit_pending'},7,false).actions.includes('pay'),false);
  assert.equal(decorateOrder({...pending,state:'exception',business_status:'paid'},1,true).actions.includes('reconcile'),false);
  assert.equal(decorateOrder({...pending,state:'credit_pending'},1,true).actions.includes('reconcile'),true);
  assert.equal(decorateOrder({...pending,state:'credited'},1,true).actions.includes('archive'),true);
  assert.equal(canResumeRecharge({status:'pending',amount:'6.00',ticket_quantity:10000}),true);
  assert.equal(canResumeRecharge({status:'pending',amount:'6.00',provider_status:'TRADE_SUCCESS'}),false);
  assert.equal(canResumeRecharge({status:'paid',amount:'6.00'}),false);
  const form=paymentFormParams({out_trade_no:'RC-original',amount:'6.00',ticket_quantity:10000},{});
  assert.equal(form.bizContent.out_trade_no,'RC-original');
});
test('recharge creation atomically records its price, quantity and creation event',async()=>{
  const log=[];let commit=0,rollback=0;
  const conn={beginTransaction:async()=>{},execute:async(sql,params)=>{log.push([sql,params]);},commit:async()=>{commit++;},rollback:async()=>{rollback++;},release(){}};
  const order=await createRechargeOrder({getConnection:async()=>conn},7);
  assert.equal(log.length,3);assert.equal(log[0][1][0],order.out_trade_no);assert.equal(log[0][1][2],'6.00');assert.equal(log[1][1][1],10000);assert.equal(commit,1);
  conn.execute=async()=>{throw Error('snapshot insert failed');};await assert.rejects(()=>createRechargeOrder({getConnection:async()=>conn},7));assert.equal(rollback,1);
});
test('signed provider lookup rejects another trade and cannot record a mismatched amount',async()=>{
  let writes=0;
  const outTradeNo='RC1700000000000ABCDEF';
  const pool={execute:async(sql)=>{if(sql.startsWith('SELECT'))return [[{id:1,user_id:7,amount:'6.00',status:'pending'}]];writes++;return [{}];}};
  const sdk={exec:async(method,params,options)=>{assert.equal(options.validateSign,true);return {code:'10000',outTradeNo,tradeNo:'trade-1',tradeStatus:'TRADE_SUCCESS',totalAmount:'0.01'};}};
  await assert.rejects(()=>refreshRecharge({pool,alipaySdk:sdk,outTradeNo,paymentConfig:{appId:'app',sellerId:'seller'},credit:false}));assert.equal(writes,0);
});
test('CSV export escapes formula cells and quotes',()=>{
  assert.equal(csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell('normal'),'"normal"');
});

async function serve(t,pool,role='user'){
  const app=express();app.use(express.json());app.use('/api/order-center',createOrderCenterRouter({pool,
    authMiddleware:(req,res,next)=>{req.userId=7;next();},recordOperation:async()=>{},revealOrderCredentials:x=>x}));
  pool.role=role;const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));return `http://127.0.0.1:${server.address().port}/api/order-center`;
}
test('ordinary users cannot choose admin scope or read another user recharge detail',async t=>{
  const pool={execute:async(sql,params)=>{
    if(sql.startsWith('SELECT role'))return [[{role:pool.role}]];
    assert.deepEqual(params,['recharge','RC-other',7,7]);return [[]];}};
  const base=await serve(t,pool);
  assert.equal((await fetch(base+'?scope=admin')).status,403);
  assert.equal((await fetch(base+'/recharge/RC-other')).status,404);
  assert.equal((await fetch(base+'/third_party/TP-other')).status,404);
});
test('admin archive requires a reason, rejects open orders, and retains the business record',async t=>{
  let rollback=0,writes=0;
  const conn={beginTransaction:async()=>{},rollback:async()=>{rollback++;},release(){},execute:async(sql)=>{if(sql.startsWith('SELECT c.'))return [[{order_type:'recharge',order_ref:'RC-test',state:'pending_payment',customer_id:7}]];writes++;return [[]];}};
  const pool={getConnection:async()=>conn,execute:async()=>[[{role:'admin'}]]};const base=await serve(t,pool,'admin');
  const send=body=>fetch(base+'/recharge/RC-test/archive?scope=admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await send({action:'archive'})).status,400);
  assert.equal((await send({action:'archive',reason:'清理列表'})).status,409);assert.equal(rollback,1);assert.equal(writes,0);
});
