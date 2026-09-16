'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),mysql=require('mysql2/promise');
const {issueSessionToken}=require('../lib/auth-session');
Object.assign(process.env,{JWT_SECRET:'b13-synthetic-jwt',DATA_ENCRYPTION_KEY:Buffer.alloc(32,13).toString('base64'),DB_HOST:'127.0.0.1',DB_USER:'test',DB_PASSWORD:'test',DB_NAME:'test',ALIPAY_ENABLED:'false'});
let taken=false,online=false,failAudit=false,snapshot;
const conn={beginTransaction:async()=>snapshot={taken,online},commit:async()=>snapshot=null,rollback:async()=>{({taken,online}=snapshot);},release(){},execute:async(q,p)=>{
 if(q.startsWith('SELECT required_identity'))return [taken?[]:[{required_identity:'standard',user_id:3}]];
 if(q.startsWith('SELECT booster_identity'))return [[{booster_identity:'gold'}]];
 if(q.startsWith('UPDATE orders SET booster_id')){taken=true;return [{affectedRows:1}];}
 if(q.startsWith('UPDATE booster_availability SET')){online=Boolean(p[0]);return [{affectedRows:1}];}
 if(q.startsWith('INSERT INTO booster_availability_events')){if(failAudit)throw Error('audit unavailable');assert.equal(p[0],7);assert.equal(p[2],'take_online');return [{affectedRows:1}];}
 if(q.startsWith('INSERT')||q.startsWith('SELECT user_id'))return [{affectedRows:1}];throw Error(q);
}};
const pool={getConnection:async()=>conn,execute:async q=>{if(q.startsWith('SELECT token_version'))return [[{token_version:0}]];if(q.startsWith('SELECT role'))return [[{role:'booster'}]];throw Error(q);}};
const old=mysql.createPool;mysql.createPool=()=>pool;const {app}=require('../server');mysql.createPool=old;
test('accepting an order and temporary online status commit together; failed audit rolls both back',async t=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}/api/booster/take/TEST`,headers={Authorization:'Bearer '+issueSessionToken(7,0,process.env.JWT_SECRET),'Content-Type':'application/json'};
 failAudit=true;assert.equal((await fetch(base,{method:'POST',headers,body:JSON.stringify({go_online:true})})).status,500);assert.equal(taken,false);assert.equal(online,false);
 failAudit=false;assert.equal((await fetch(base,{method:'POST',headers,body:JSON.stringify({go_online:true})})).status,200);assert.equal(taken,true);assert.equal(online,true);
});
