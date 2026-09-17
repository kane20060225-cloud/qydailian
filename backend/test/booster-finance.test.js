'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const {filters,preview,reverseTest,earnings}=require('../lib/booster-finance');
const {createBoosterFinanceRouter}=require('../routes/booster-finance');
function fixture({legacy=false}={}){
 let balance=100,ledger=legacy?[]:[{id:1,entry_key:'order:TEST:booster_earnings',user_id:7,account_type:'earnings',amount_delta:52.65}],snapshot,failAudit=false;
 const conn={beginTransaction:async()=>snapshot=structuredClone({balance,ledger}),commit:async()=>{},rollback:async()=>({balance,ledger}=snapshot),release(){},execute:async(sql,p)=>{
  if(sql.startsWith('SELECT order_ref FROM income_test_orders'))return [[]];
  if(sql.startsWith('SELECT order_no'))return [[{order_no:'TEST',booster_id:7,status:'done',payment_status:'paid',total_price:70.2}]];
  if(sql.startsWith('SELECT id,username'))return [[{id:7,username:'fixture',earnings:balance}]];
  if(sql.startsWith('SELECT id,entry_key'))return [ledger];
  if(sql.startsWith('SELECT earnings AS balance'))return [[{balance}]];
  if(sql.startsWith('UPDATE users SET earnings')){balance=p[0];return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO account_ledger')){ledger.push({id:2,entry_key:p[0],user_id:p[1],account_type:p[2],amount_delta:p[3]});return [{}];}
  if(sql.startsWith('INSERT INTO operation_audit')||sql.startsWith('INSERT INTO order_management_events')){if(failAudit)throw Error('audit failed');return [{}];}
  throw Error(sql);
 }};
 return {pool:{execute:conn.execute,getConnection:async()=>conn},get balance(){return balance;},get ledger(){return ledger;},set balance(v){balance=v;},set failAudit(v){failAudit=v;}};
}
test('earnings ranges use Beijing calendar days and inclusive end dates',()=>{
 const now=Date.parse('2026-09-16T17:00:00Z');
 const f=filters({range:'7'},now);assert.equal(new Date(f.from*1000).toISOString(),'2026-09-10T16:00:00.000Z');assert.equal(new Date(f.to*1000).toISOString(),'2026-09-17T16:00:00.000Z');
 const custom=filters({range:'custom',from:'2026-09-17',to:'2026-09-17'});assert.equal(custom.to-custom.from,86400);
 for(const q of [{range:'bad'},{range:'custom',from:'2026-13-01',to:'2026-09-17'},{range:'custom',from:'2026-02-30',to:'2026-09-17'},{range:'custom',from:'2026-09-18',to:'2026-09-17'},{page:'1 OR 1=1'}])assert.throws(()=>filters(q),e=>e.status===400);
});
test('earnings reports are user scoped, ledger based and identify unlinked historical balances',async()=>{
 let scoped=0;
 const pool={execute:async(sql,p)=>{
  assert.equal(p[0],7);assert.ok(!sql.includes('UPDATE'));scoped++;
  if(sql.startsWith('SELECT earnings,role'))return [[{earnings:100,role:'booster'}]];
  if(sql.includes('AS income'))return [[{income:52.65,deductions:0,net:52.65,total:1}]];
  if(sql.includes('AS orders'))return [[{orders:1,estimate:10}]];
  if(sql.startsWith('SELECT l.id')){assert.ok(sql.includes('o.booster_id=l.user_id'));assert.ok(sql.includes('FROM_UNIXTIME(?)'));return [[]];}
  return [[{net:52.65}]];
 }};
 const r=await earnings(pool,7,{range:'7'});assert.equal(r.legacy_unlinked,47.35);assert.equal(r.admin,false);assert.equal(scoped,5);
});
test('test reversal uses exact original amount, rejects repeat and keeps the original ledger',async()=>{
 const f=fixture(),p=await preview(f.pool,'TEST');
 await reverseTest({pool:f.pool,ref:'TEST',actor:3,body:{snapshot:p.snapshot,confirmation:'REVERSE_TEST_EARNINGS',reason:'confirmed test order',amount:99999}});
 assert.equal(f.balance,47.35);assert.equal(f.ledger[0].amount_delta,52.65);assert.equal(f.ledger[1].amount_delta,-52.65);
 await assert.rejects(()=>reverseTest({pool:f.pool,ref:'TEST',actor:3,body:{snapshot:p.snapshot,confirmation:'REVERSE_TEST_EARNINGS',reason:'repeat test'}}),e=>e.status===409);
 assert.equal(f.balance,47.35);
});
test('stale previews, missing confirmation and audit failure cannot change earnings',async()=>{
 const f=fixture(),p=await preview(f.pool,'TEST'),body={snapshot:p.snapshot,confirmation:'REVERSE_TEST_EARNINGS',reason:'test order'};
 await assert.rejects(()=>reverseTest({pool:f.pool,ref:'TEST',actor:3,body:{...body,confirmation:''}}));
 f.balance=101;await assert.rejects(()=>reverseTest({pool:f.pool,ref:'TEST',actor:3,body}),e=>e.status===409);assert.equal(f.balance,101);
 const updated=await preview(f.pool,'TEST');f.failAudit=true;await assert.rejects(()=>reverseTest({pool:f.pool,ref:'TEST',actor:3,body:{...body,snapshot:updated.snapshot}}));assert.equal(f.balance,101);assert.equal(f.ledger.length,1);
});
test('historical corrections require explicit amount and evidence, bounded to the order',async()=>{
 const f=fixture({legacy:true});assert.equal((await preview(f.pool,'TEST')).amount,null);
 await assert.rejects(()=>preview(f.pool,'TEST','100'),e=>e.status===400);
 const p=await preview(f.pool,'TEST','50'),body={snapshot:p.snapshot,legacy_amount:50,confirmation:'REVERSE_TEST_EARNINGS',reason:'historical test order'};
 await assert.rejects(()=>reverseTest({pool:f.pool,ref:'TEST',actor:3,body}));assert.equal(f.balance,100);
 await reverseTest({pool:f.pool,ref:'TEST',actor:3,body:{...body,reference:'verified old statement'}});assert.equal(f.balance,50);assert.equal(f.ledger.length,1);
});
test('ordinary boosters cannot use the administrator preview or correction endpoint',async t=>{
 const app=express();app.use(express.json());let reached=false;
 app.use('/api',createBoosterFinanceRouter({pool:{execute:async()=>{reached=true;throw Error();}},boosterMiddleware:(req,res,next)=>{req.userId=7;next();},adminMiddleware:(req,res)=>res.status(403).json({error:'admin required'})}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;
 for(const method of ['GET','POST'])assert.equal((await fetch(base+'/api/admin/booster-finance/TEST/'+(method==='GET'?'preview':'reverse-test'),{method})).status,403);
 assert.equal(reached,false);
});
