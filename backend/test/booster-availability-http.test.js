'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createAvailabilityRouter}=require('../routes/booster-availability');
const {emptySchedule}=require('../lib/booster-availability');
async function setup(t){
 let row={user_id:7,mode:'manual',manual_online:0},events=[],snapshot,failAudit=false;
 const conn={beginTransaction:async()=>snapshot=structuredClone({row,events}),commit:async()=>snapshot=null,rollback:async()=>{row=snapshot.row;events=snapshot.events;},release(){},execute:async(q,p)=>{
  if(q.startsWith('INSERT IGNORE INTO booster_availability')||q.startsWith('SELECT user_id')||q.startsWith('UPDATE notification_deliveries'))return [{affectedRows:1}];
  if(q.startsWith('SELECT role'))return [[{role:Number(p[0])===7?'booster':'user'}]];
  if(q.startsWith('UPDATE booster_availability SET')){const fields=q.slice(q.indexOf(' SET ')+5,q.indexOf(',updated_at')).split(',').map(s=>s.split('=')[0]);fields.forEach((k,i)=>row[k]=p[i]);return [{affectedRows:1}];}
  if(q.startsWith('INSERT INTO booster_availability_events')){if(failAudit)throw Error('audit failed');events.push({user_id:p[0],actor_id:p[1],action:p[2],detail:p[3]});return [{affectedRows:1}];}throw Error(q);
 }};
 const pool={getConnection:async()=>conn,execute:async(q,p)=>{
  if(q==='SELECT * FROM booster_availability WHERE user_id=?'){assert.equal(p[0],7);return [[row]];}
  if(q.startsWith('SELECT COUNT(DISTINCT'))return [[{active_orders:2,bound:1,app_enabled:1,preferences_enabled:1}]];
  if(q.startsWith('SELECT action')||q.startsWith('SELECT e.action')){assert.equal(Number(p[0]),7);return [events];}
  if(q.startsWith('SELECT u.id'))return [[{...row,id:7,username:'synthetic',role:'booster',booster_identity:'standard',active_orders:2,wecom_bound:1}]];
  throw Error(q);
 }};
 const middleware=admin=>(req,res,next)=>{const role=req.headers.authorization?.slice(7);if(!role)return res.status(401).json({error:'login'});if(admin?role!=='admin':!['booster','admin'].includes(role))return res.status(403).json({error:'role'});req.userId=role==='admin'?3:7;next();};
 const app=express();app.use(express.json());app.use(createAvailabilityRouter({pool,boosterMiddleware:middleware(false),adminMiddleware:middleware(true)}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r));});
 return {base:`http://127.0.0.1:${server.address().port}`,events:()=>events,row:()=>row,fail:()=>failAudit=true};
}
const request=(base,path,role,body)=>fetch(base+path,{method:body?'PUT':'GET',headers:{...(role?{Authorization:'Bearer '+role}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
test('availability routes reject anonymous users and customers; admin controls cannot be called by boosters',async t=>{
 const {base}=await setup(t);
 assert.equal((await request(base,'/booster/availability')).status,401);
 assert.equal((await request(base,'/booster/availability','user')).status,403);
 assert.equal((await request(base,'/admin/booster-availability','booster')).status,403);
 assert.equal((await request(base,'/admin/booster-availability/7','booster',{paused:true,reason:'休息',hours:null})).status,403);
});
test('self updates target the authenticated account, are audited, and roll back if the audit fails',async t=>{
 const system=await setup(t),body={action:'configure',mode:'manual',manual_online:true,weekly_schedule:emptySchedule(),user_id:999};
 const res=await request(system.base,'/booster/availability','booster',body);assert.equal(res.status,200);assert.equal((await res.json()).online,true);
 assert.equal(system.events()[0].user_id,7);assert.equal(system.events()[0].actor_id,7);
 system.fail();assert.equal((await request(system.base,'/booster/availability','booster',{action:'temporary',online:false,hours:2})).status,503);
 assert.equal(system.row().override_online,null);assert.equal(system.events().length,1);
});
test('admin pause is independent of self scheduling, requires a reason, and history is user scoped',async t=>{
 const system=await setup(t);
 assert.equal((await request(system.base,'/admin/booster-availability/7','admin',{paused:true,reason:'',hours:null})).status,400);
 assert.equal((await request(system.base,'/admin/booster-availability/99','admin',{paused:true,reason:'休息',hours:2})).status,404);
 assert.equal((await request(system.base,'/admin/booster-availability/7','admin',{paused:true,reason:'休息',hours:2})).status,200);
 assert.equal((await request(system.base,'/booster/availability','booster',{action:'temporary',online:true,hours:4})).status,200);
 const state=await (await request(system.base,'/booster/availability','booster')).json();assert.equal(state.source,'admin');assert.equal(state.online,false);
 assert.equal((await request(system.base,'/admin/booster-availability/7/events','admin')).status,200);
 assert.equal((await request(system.base,'/admin/booster-availability/7','admin',{paused:false,reason:'',hours:null})).status,200);
 assert.equal(system.row().override_online,1);
});
