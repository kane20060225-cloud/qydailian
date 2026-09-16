'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {createWecomClient,validateConfig}=require('../lib/wecom-client');
const {canReceiveOrder,createNotificationSystem}=require('../lib/order-notifications');
const {createNotificationRouter}=require('../routes/order-notifications');
const {createFieldCipher}=require('../lib/field-encryption');
test('order recipients must have a known identity and sufficient order privileges',()=>{
  assert.equal(canReceiveOrder('gold','silver'),true);assert.equal(canReceiveOrder('budget','standard'),false);assert.equal(canReceiveOrder('gold','invalid'),false);assert.equal(canReceiveOrder('invalid','budget'),false);
  for(const body of [{enabled:'true'},{enabled:true,corp_id:'ww12345678',agent_id:1,corp_secret:'enc:v1:malicious'}])assert.throws(()=>validateConfig(body));
});
test('WeCom caches tokens, refreshes expired credentials and sends a single explicit user without game credentials',async()=>{
  let tokens=0,sends=0;const config={corp_id:'ww12345678',agent_id:1000002,secret:'syntheticSecret1234'};
  const client=createWecomClient({fetchImpl:async(url,options)=>{
    const parsed=new URL(url);assert.equal(parsed.origin,'https://qyapi.weixin.qq.com');assert.equal(options.redirect,'error');
    if(parsed.pathname.endsWith('gettoken')){tokens++;return {ok:true,json:async()=>({access_token:'token-'+tokens,expires_in:7200})};}
    if(parsed.pathname.endsWith('getuserinfo'))return {ok:true,json:async()=>({UserId:'worker_1'})};
    sends++;const body=JSON.parse(options.body);assert.equal(body.touser,'worker_1');assert.equal(body.enable_duplicate_check,1);assert.equal(body.duplicate_check_interval,1800);assert.match(body.text.content,/notify_order=TEST-1/);assert.match(body.text.content,/notify_kind=take_confirmed/);assert.match(body.text.content,/notify_type=boost/);assert.equal(body.text.content.includes('syntheticSecret'),false);
    return {ok:true,json:async()=>sends===1?{errcode:42001}:{errcode:0,msgid:'synthetic-message'}};
  }});
  await Promise.all([client.token(config),client.token(config)]);assert.equal(tokens,1);
  assert.equal(await client.identity(config,'synthetic-code'),'worker_1');assert.equal(tokens,1);
  assert.equal(await client.send(config,'worker_1',{title:'接单成功',kind:'take_confirmed',order_type:'boost',body:'预计收益6元',order_ref:'TEST-1'},'https://example.test'),'synthetic-message');assert.equal(tokens,2);assert.equal(sends,2);
  await assert.rejects(()=>client.send(config,'@all',{},'https://example.test'),/暂不可用/);
});
test('provider network errors never expose credential-bearing URLs or raw upstream messages',async()=>{
  const client=createWecomClient({fetchImpl:async url=>{throw Error('failed URL '+url);}});
  await assert.rejects(()=>client.token({corp_id:'ww12345678',agent_id:1,secret:'privateSecretValue'}),err=>err.code==='WECOM_NETWORK'&&!err.message.includes('privateSecretValue'));
});
async function serve(t,pool,system){const app=express();app.use(express.json());app.use(createNotificationRouter({pool,system,
  authMiddleware:(req,res,next)=>{if(req.headers.authorization!=='Bearer synthetic')return res.status(401).json({error:'login required'});req.userId=7;req.tokenVersion=0;next();},
  cipher:createFieldCipher(Buffer.alloc(32,12).toString('base64')),wecomClient:{},siteUrl:'https://example.test',recordOperation:async()=>{}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r));});return `http://127.0.0.1:${server.address().port}`;}
test('notification reads are scoped to the current user and enterprise configuration is admin-only',async t=>{
  let updates=0;const pool={execute:async(sql,p)=>{if(sql.startsWith('SELECT role'))return [[{role:'user'}]];
    if(sql.startsWith('UPDATE order_notifications')){assert.deepEqual(p,['3',7]);updates++;return [{affectedRows:0}];}throw Error(sql);}};
  const base=await serve(t,pool,{poke(){}}),headers={Authorization:'Bearer synthetic'};
  assert.equal((await fetch(base+'/wecom/config',{headers})).status,403);assert.equal((await fetch(base+'/wecom/config/check',{method:'POST',headers})).status,403);
  assert.equal((await fetch(base+'/wecom/bind',{method:'POST',headers})).status,403);
  assert.equal((await fetch(base+'/3/read',{method:'PUT',headers})).status,200);assert.equal(updates,1);
  assert.equal((await fetch(base+'/stream?token=synthetic')).status,401);
  assert.equal((await fetch(base+'/stream?since=-1',{headers})).status,400);
});
test('header-authenticated SSE delivers committed updates and closes a revoked session',async t=>{
  let subscriber,currentVersion=0,count=0;const system={snapshot:async(user,cursor)=>{assert.equal(user,7);return {cursor:count,unread_count:count,notifications:cursor===null?[]:[{id:count,title:'test',body:'public summary'}],bootstrap:cursor===null};},subscribe:fn=>{subscriber=fn;return ()=>{subscriber=null;};}};
  const pool={execute:async sql=>sql.startsWith('SELECT role')?[[{role:'booster'}]]:[[{token_version:currentVersion}]]};const base=await serve(t,pool,system),controller=new AbortController();
  const res=await fetch(base+'/stream',{headers:{Authorization:'Bearer synthetic'},signal:controller.signal});assert.match(res.headers.get('content-type'),/text\/event-stream/);assert.equal(res.headers.get('x-accel-buffering'),'no');
  const reader=res.body.getReader(),decoder=new TextDecoder();assert.match(decoder.decode((await reader.read()).value),/"bootstrap":true/);
  count=1;subscriber();assert.match(decoder.decode((await reader.read()).value),/"unread_count":1/);
  currentVersion=1;subscriber();assert.match(decoder.decode((await reader.read()).value),/session_expired/);controller.abort();assert.equal(subscriber,null);
});
test('a disabled unconfigured enterprise app never sends external messages',async()=>{
  let sends=0;const system=createNotificationSystem({pool:{execute:async()=>[[]]},cipher:{},wecomClient:{send:async()=>{sends++;}},siteUrl:'https://example.test'});
  assert.equal((await system.deliver()).disabled,true);assert.equal(sends,0);
});
