'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Readable}=require('node:stream');const {submit,review}=require('../lib/boost-completion');
async function fixture(t){
 const uploadDir=await fs.mkdtemp(path.join(os.tmpdir(),'boost-completion-'));t.after(()=>fs.rm(uploadDir,{recursive:true,force:true}));
 let state={order:{order_no:'TEST',user_id:3,booster_id:7,status:'playing',payment_status:'paid'},rows:[],earnings:0},snapshot,failAudit=false;
 const conn={beginTransaction:async()=>snapshot=structuredClone(state),commit:async()=>{},rollback:async()=>state=snapshot,release(){},execute:async(q,p)=>{
  if(q.startsWith('SELECT * FROM orders'))return [[state.order].filter(o=>o.order_no===p[0]&&(p.length===1||o.booster_id===p[1]&&o.status===p[2]))];
  if(q.startsWith('SELECT id FROM boost'))return [state.rows.filter(r=>r.order_no===p[0]&&r.status==='pending')];
  if(q.startsWith('INSERT INTO boost')){const id=state.rows.length+1;state.rows.push({id,order_no:p[0],booster_id:p[1],filename:p[2],note:p[3],status:'pending'});return [{insertId:id}];}
  if(q.startsWith('SELECT order_no FROM boost')||q.startsWith('SELECT * FROM boost'))return [state.rows.filter(r=>r.id===Number(p[0]))];
  if(q.startsWith('UPDATE boost')){const r=state.rows.find(r=>r.id===Number(p[3]));r.status=p[0];r.review_reason=p[2];return [{}];}
  if(q.startsWith('INSERT INTO order_management_events')||q.startsWith('INSERT INTO operation_audit')){if(failAudit)throw Error('audit failure');return [{}];}
  throw Error(q);
 }};
 const settle=async()=>{state.earnings+=7.5;state.order.status='done';return 7.5;};settle.uploadDir=uploadDir;
 return {pool:{getConnection:async()=>conn},settle,uploadDir,get state(){return state;},set failAudit(v){failAudit=v;}};
}
const image=()=>Readable.from([Buffer.from('89504e470d0a1a0a00000000','hex')]);
const send=f=>submit({pool:f.pool,userId:7,orderNo:'TEST',stream:image(),contentType:'image/png',uploadDir:f.uploadDir});
const approve=(f,id,decision='approved',reason='')=>review({pool:f.pool,id,actor:1,decision,reason,settle:f.settle});
test('screenshot submission pays nothing; admin approval pays once',async t=>{
 const f=await fixture(t);const s=await send(f);assert.equal(f.state.earnings,0);assert.equal(f.state.order.status,'playing');
 await assert.rejects(()=>send(f),e=>e.status===409);assert.equal((await fs.readdir(f.uploadDir)).length,1);
 await approve(f,s.submission_id);assert.equal(f.state.earnings,7.5);assert.equal(f.state.order.status,'done');
 await assert.rejects(()=>approve(f,s.submission_id),e=>e.status===409);assert.equal(f.state.earnings,7.5);
});
test('rejection requires a reason, pays nothing and permits a new screenshot',async t=>{
 const f=await fixture(t),s=await send(f);await assert.rejects(()=>approve(f,s.submission_id,'rejected',''),e=>e.status===400);
 await approve(f,s.submission_id,'rejected','完成数量不符');assert.equal(f.state.earnings,0);const second=await send(f);
 assert.equal(f.state.rows[0].review_reason,'完成数量不符');assert.equal(second.submission_id,2);await approve(f,2);assert.equal(f.state.earnings,7.5);
});
test('foreign/unpaid orders and invalid images cannot submit; audit rollback removes the uncommitted image',async t=>{
 const f=await fixture(t);await assert.rejects(()=>submit({pool:f.pool,userId:9,orderNo:'TEST',stream:image(),contentType:'image/png',uploadDir:f.uploadDir}));
 f.state.order.payment_status='unpaid';await assert.rejects(()=>send(f));f.state.order.payment_status='paid';
 await assert.rejects(()=>submit({pool:f.pool,userId:7,orderNo:'TEST',stream:Readable.from(['bad-image']),contentType:'image/png',uploadDir:f.uploadDir}));
 f.failAudit=true;await assert.rejects(()=>send(f));assert.equal(f.state.rows.length,0);assert.equal((await fs.readdir(f.uploadDir)).length,0);
});
test('missing screenshot and audit failure cannot settle or approve',async t=>{
 const f=await fixture(t);await send(f);f.failAudit=true;await assert.rejects(()=>approve(f,1));assert.equal(f.state.earnings,0);assert.equal(f.state.rows[0].status,'pending');
 f.failAudit=false;await fs.unlink(path.join(f.uploadDir,f.state.rows[0].filename));await assert.rejects(()=>approve(f,1));assert.equal(f.state.earnings,0);
});
test('ordinary boosters cannot review submissions or read another customer screenshot',async t=>{
 const express=require('express'),{createCompletionRouter}=require('../routes/boost-completion');let reached=false;
 const pool={execute:async q=>{reached=true;if(q.startsWith('SELECT s.filename'))return [[{filename:'hidden.png',booster_id:8,user_id:3}]];return [[{role:'booster'}]];}};
 const app=express();app.use('/api',createCompletionRouter({pool,authMiddleware:(req,res,next)=>{req.userId=7;next();},boosterMiddleware:(req,res,next)=>{req.userId=7;next();},adminMiddleware:(req,res)=>res.status(403).json({error:'admin required'}),uploadDir:os.tmpdir(),settle:async()=>{},notify(){}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/admin/boost-completions/1/review',{method:'POST'})).status,403);assert.equal(reached,false);
 assert.equal((await fetch(base+'/api/boost-completions/1/image')).status,404);
});
