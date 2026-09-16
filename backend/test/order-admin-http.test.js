'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const mysql=require('mysql2/promise');const {issueSessionToken}=require('../lib/auth-session');
Object.assign(process.env,{JWT_SECRET:'b9-test-jwt',DATA_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'),DB_HOST:'127.0.0.1',DB_USER:'test',DB_PASSWORD:'test',DB_NAME:'test',ALIPAY_ENABLED:'false'});
let row,updates=0,audits=0,failAudit=false,snapshot;
const conn={beginTransaction:async()=>{snapshot=row?{...row}:null;},commit:async()=>{snapshot=null;},rollback:async()=>{row=snapshot?{...snapshot}:null;},release(){},execute:async(sql,p)=>{
  if(sql==='SELECT * FROM booster_availability')return [[]];
  if(sql.startsWith('SELECT id,status,payment_status,booster_id,hall_status'))return [row?[{...row}]:[]];
  if(sql.startsWith('UPDATE orders SET hall_status')){row.hall_status=p[0];updates++;return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO operation_audit')){if(failAudit)throw Error('audit unavailable');audits++;return [{affectedRows:1}];}
  if(sql.startsWith('INSERT IGNORE INTO order_notifications') || sql.startsWith('INSERT IGNORE INTO notification_deliveries'))return [{affectedRows:1}];
  throw Error(sql);
}};
const pool={getConnection:async()=>conn,execute:async sql=>{if(sql.startsWith('SELECT token_version'))return [[{token_version:0}]];if(sql.startsWith('SELECT role'))return [[{role:'admin'}]];throw Error(sql);}};
const original=mysql.createPool;mysql.createPool=()=>pool;const {app}=require('../server');mysql.createPool=original;
async function serve(t){const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));return `http://127.0.0.1:${server.address().port}/api/admin/orders/TEST`;
}
const headers={Authorization:`Bearer ${issueSessionToken(3,0,process.env.JWT_SECRET)}`};
test('dispatch accepts only paid, unassigned pending orders and rejects replay',async t=>{
  const base=await serve(t);updates=0;audits=0;failAudit=false;
  for(const change of [{payment_status:'unpaid'},{status:'done'},{booster_id:5},{hall_status:'open'}]){
    row={id:1,status:'pending',payment_status:'paid',booster_id:null,hall_status:null,...change};assert.equal((await fetch(base+'/hall',{method:'PUT',headers})).status,409);
  }
  assert.equal(updates,0);row={id:1,status:'pending',payment_status:'paid',booster_id:null,hall_status:null};
  assert.equal((await fetch(base+'/hall',{method:'PUT',headers})).status,200);assert.equal((await fetch(base+'/hall',{method:'PUT',headers})).status,409);assert.equal(updates,1);assert.equal(audits,1);
});
test('a failed dispatch audit rolls back hall visibility',async t=>{
  const base=await serve(t);row={id:1,status:'pending',payment_status:'paid',booster_id:null,hall_status:null};failAudit=true;
  assert.equal((await fetch(base+'/hall',{method:'PUT',headers})).status,500);assert.equal(row.hall_status,null);failAudit=false;
});
test('legacy direct status overwrite and deletion cannot erase order history',async t=>{
  const base=await serve(t);assert.equal((await fetch(base,{method:'DELETE',headers})).status,409);assert.equal((await fetch(base,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({status:'done'})})).status,409);
});
