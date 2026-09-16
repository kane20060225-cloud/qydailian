'use strict';
// Local API fixtures with the real SSE router and full website. No enterprise calls or real messages.
const assert=require('node:assert/strict');const path=require('node:path');const express=require('express');const {chromium}=require('playwright');
const {createNotificationRouter}=require('../routes/order-notifications');const {createFieldCipher}=require('../lib/field-encryption');
(async()=>{
  const app=express();app.use(express.json());let notifications=[],subscribers=new Set(),failStream=false;const preferences=new Map();
  const pool={execute:async(sql,p=[])=>{
    if(sql.startsWith('SELECT role'))return [[{role:p[0]===2?'admin':'booster'}]];
    if(sql.startsWith('SELECT token_version')){if(failStream){failStream=false;throw Error('synthetic stream interruption');}return [[{token_version:0}]];}
    if(sql.startsWith('SELECT new_orders'))return [preferences.has(p[0])?[preferences.get(p[0])]:[]];
    if(sql.startsWith('INSERT INTO notification_preferences')){preferences.set(p[0],{new_orders:p[1],wecom:p[2],sound:p[3]});return [{}];}
    if(sql.startsWith('SELECT * FROM wecom_notification_config')||sql.startsWith('SELECT wecom_user_id')||sql.startsWith('SELECT status'))return [[]];
    if(sql.startsWith('SELECT id,kind'))return [notifications.filter(n=>n.user_id===p[0]).sort((a,b)=>b.id-a.id)];
    if(sql.startsWith('UPDATE order_notifications')){notifications.forEach(n=>{if(n.user_id===p.at(-1)&& (p.length===1||String(n.id)===String(p[0])))n.read_at=new Date().toISOString();});return [{}];}
    throw Error('Unexpected fixture query '+sql);
  }};
  const system={poke(){subscribers.forEach(fn=>fn());},subscribe(fn){subscribers.add(fn);return ()=>subscribers.delete(fn);},async snapshot(user,cursor){const own=notifications.filter(n=>n.user_id===user),last=own.length?Math.max(...own.map(n=>n.id)):0;return {unread_count:own.filter(n=>!n.read_at).length,cursor:last,bootstrap:cursor===null,notifications:cursor===null?[]:own.filter(n=>n.id>cursor)};}};
  app.use('/api/notifications',createNotificationRouter({pool,system,cipher:createFieldCipher(Buffer.alloc(32,12).toString('base64')),wecomClient:{},siteUrl:'https://example.test',recordOperation:async()=>{},authMiddleware:(req,res,next)=>{const token=req.headers.authorization;if(!['Bearer synthetic','Bearer synthetic-admin'].includes(token))return res.status(401).json({error:'login required'});req.userId=token==='Bearer synthetic-admin'?2:7;req.tokenVersion=0;next();}}));
  app.use(express.static(path.join(__dirname,'..','..','public')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`;let browser;
  try{browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
      notifications=[{id:1,user_id:7,kind:'new_order',order_type:'boost',order_ref:'TEST-HALL',title:'历史提醒',body:'old message',created_at:new Date().toISOString(),read_at:null}];preferences.clear();const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{localStorage.setItem('token','synthetic');localStorage.setItem('role','booster');localStorage.setItem('userId','7');localStorage.setItem('username','test-worker');});
      await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==origin){await route.abort();return;}if(url.pathname.startsWith('/api/notifications')||!url.pathname.startsWith('/api/')){await route.continue();return;}
        let data=[];if(url.pathname==='/api/order-center')data={orders:[],total:0,page:1,page_size:25,summary:[]};
        else if(url.pathname==='/api/user/profile')data={id:7,username:'test-worker',role:'booster',booster_identity:'standard',qy_credits:0,chest_tickets:0};
        else if(url.pathname==='/api/booster/hall')data=[{order_no:'TEST-HALL',project:'silver',detail:'synthetic',quantity:1,client_type:'Android',required_identity:'standard',earnings:7.5}];
        else if(url.pathname==='/api/user/settings')data={notify_order_update:1,notify_promotion:0,theme:'dark'};
        else if(url.pathname==='/api/chest/tickets')data={tickets:0};
        await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
      });
      await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#orderNotificationCount')?.textContent==='1');
      assert.equal(await page.locator('.order-live-alert').count(),0);
      notifications.push({id:2,user_id:7,kind:'new_order',order_type:'boost',order_ref:'TEST-HALL',title:'新订单 <img src=x onerror="window.notificationXss=1">',body:'仅本账号可见的订单摘要',created_at:new Date().toISOString(),read_at:null},{id:3,user_id:8,kind:'new_order',order_type:'boost',order_ref:'OTHER',title:'other user',body:'never show',created_at:new Date().toISOString(),read_at:null});system.poke();
      await page.locator('.order-live-alert').waitFor();assert.equal(await page.locator('#orderNotificationCount').textContent(),'2');assert.equal(await page.locator('.order-live-alert img').count(),0);assert.equal(await page.evaluate(()=>window.notificationXss),undefined);
      await page.locator('.order-live-alert [data-open]').click();await page.locator('#hallOrderList [data-order="TEST-HALL"]').waitFor();assert.equal(await page.evaluate(()=>document.body.dataset.currentSection),'booster');
      await page.locator('#orderNotificationButton').click();await page.locator('.order-notification-item').first().waitFor();assert.equal(await page.locator('.order-notification-item').count(),2);assert.equal(await page.locator('#orderNotificationBody').textContent().then(t=>t.includes('never show')),false);
      await page.locator('#orderNotificationReadAll').click();await page.waitForFunction(()=>document.querySelector('#orderNotificationCount').hidden);await page.keyboard.press('Escape');
      failStream=true;system.poke();notifications.push({id:4,user_id:7,kind:'new_order',order_type:'boost',order_ref:'TEST-HALL',title:'断线期间新增订单',body:'重连后自动补收',created_at:new Date().toISOString(),read_at:null});
      await page.waitForFunction(()=>document.querySelector('.order-live-alert')?.textContent.includes('重连后自动补收'));assert.equal(await page.locator('#orderNotificationCount').textContent(),'1');
      await page.evaluate(()=>{showSection('settings');});await page.locator('.settings-nav-btn[data-setting="notifications"]').click();await page.locator('#notifySound').waitFor();assert.equal(await page.locator('#notifySound').isChecked(),false);assert.equal(await page.locator('[data-bind]').isDisabled(),true);
      await page.locator('#notifyNewOrders').uncheck();await page.locator('[data-save-pref]').click();await page.waitForFunction(()=>[...document.querySelectorAll('.toast-message')].some(e=>e.textContent==='接单提醒已保存'));assert.equal(preferences.get(7).new_orders,0);
      await page.evaluate(()=>document.querySelectorAll('.order-live-alert').forEach(e=>e.remove()));notifications.push({id:5,user_id:7,kind:'new_order',order_type:'boost',order_ref:'TEST-HALL',title:'已关闭接单弹窗',body:'queued before preference change',created_at:new Date().toISOString(),read_at:null});system.poke();await page.waitForFunction(()=>document.querySelector('#orderNotificationCount').textContent==='2');assert.equal(await page.locator('.order-live-alert').count(),0);
      await page.goto(origin+'/?notify_order=TEST-HALL&notify_kind=take_confirmed&notify_type=boost',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('.booster-tab[data-tab="booster-my"]')?.classList.contains('active'));assert.equal(new URL(page.url()).search,'');
      await page.evaluate(()=>showSection('settings'));await page.locator('.settings-nav-btn[data-setting="notifications"]').click();await page.locator('#notifySound').waitFor();
      await page.evaluate(()=>{localStorage.setItem('token','synthetic-admin');localStorage.setItem('role','admin');checkLoginStatus();renderNotifications();});await page.locator('#wecomCorpId').waitFor();assert.equal(await page.locator('#wecomSendEnabled').isChecked(),false);assert.equal(await page.locator('[data-check-config]').isDisabled(),true);
      assert.ok((await page.locator('#wecomAdminSettings').textContent()).includes('创建应用'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.evaluate(()=>{localStorage.removeItem('token');localStorage.removeItem('username');checkLoginStatus();});assert.equal(await page.locator('#orderNotificationButton').isHidden(),true);assert.equal(await page.locator('.order-live-alert').count(),0);
      assert.deepEqual(errors,[]);await context.close();console.log(`Notification browser verification passed at ${viewport.width}×${viewport.height}: real SSE, scoped unread inbox, safe live alerts, reconnect catch-up, preferences, enterprise setup and logout.`);
    }
  }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(err=>{console.error(err);process.exitCode=1;});
