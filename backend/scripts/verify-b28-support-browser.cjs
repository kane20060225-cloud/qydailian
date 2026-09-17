'use strict';
// Isolated browser fixtures: no production requests or account changes.
const assert=require('node:assert/strict'),express=require('express'),path=require('node:path'),fs=require('node:fs');const {chromium}=require('playwright');
(async()=>{
 const app=express();app.use(express.static(path.resolve(__dirname,'../../public')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`,out=path.resolve(__dirname,'../../artifacts/b28-preview');fs.mkdirSync(out,{recursive:true});let browser;
 try{browser=await chromium.launch({headless:true,channel:'msedge'});
 for(const theme of ['dark','light'])for(const width of [1440,390,320]){
  const role=width===390?'support':'admin',context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],sent=[],roleWrites=[];let failSend=true;
  page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(({theme,role})=>{localStorage.setItem('theme',theme);localStorage.setItem('token','fixture');localStorage.setItem('username','测试客服');localStorage.setItem('userId','3');localStorage.setItem('role',role);},{theme,role});
  let chat=[{id:1,sender_id:1,sender_kind:'customer',client_id:'initial_message_01',body:'你好，我的订单什么时候开始？',has_image:0,created_at:new Date().toISOString()}];const conversation={id:11,customer_id:1,order_type:'boost',order_ref:'ORDER1',status:'pending',waiting_since:new Date(Date.now()-35*60000).toISOString(),updated_at:new Date().toISOString(),last_message_id:1,username:'需要帮助的玩家',order:{order_type:'boost',order_ref:'ORDER1',title:'胜率代练 · 标准服务',amount:28,amount_unit:'money',state_label:'代练中'}};
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.route('**/api/**',async r=>{
   const req=r.request(),url=new URL(req.url()),p=url.pathname;let d={};if(url.origin!==origin){await r.abort();return;}
   if(p==='/api/service-content')d=require('../lib/service-content').published({revision:1,...require('../lib/service-content').defaults});
   else if(p==='/api/support/settings')d={is_staff:true,is_admin:role==='admin',configured:1,start_hour:9,end_hour:21,enabled:1,open:true,service_time:'每天 09:00–21:00（北京时间）'};
   else if(p==='/api/support/stream'){await r.fulfill({contentType:'text/event-stream',body:'event: sync\ndata: {"is_staff":true}\n\n'});return;}
   else if(p==='/api/support/summary')d={unread:0,staff_unread:1};
   else if(p==='/api/support/conversations')d=req.method()==='POST'?{id:11}:{conversations:[conversation],has_more:false,page:1};
   else if(p==='/api/support/conversations/11')d=conversation;
   else if(p==='/api/support/conversations/11/messages'){
    if(req.method()==='POST'){const b=req.postDataJSON();sent.push(b);if(!chat.find(m=>m.client_id===b.client_id))chat.push({id:chat.length+1,sender_id:3,sender_kind:'staff',body:b.body,client_id:b.client_id,created_at:new Date().toISOString()});if(failSend){failSend=false;await r.fulfill({status:503,json:{error:'模拟发送结果未确认'}});return;}d={id:chat.at(-1).id};}
    else d={messages:chat.filter(m=>!url.searchParams.has('after')||m.id>Number(url.searchParams.get('after'))),has_more:false};
   }else if(p==='/api/support/conversations/11/status'){conversation.status=req.postDataJSON().status;d={success:true};}
   else if(p==='/api/support/staff/notifications')d={ready_count:0,members:[{id:3,username:'测试客服',ready:0}],deliveries:[{status:'failed',last_error_code:'WECOM_RECIPIENT_UNAVAILABLE'}]};
   else if(p==='/api/admin/users')d={users:[{id:1,username:'玩家<安全显示>',role:'user',created_at:new Date().toISOString()},{id:2,username:'另一个玩家',role:'booster'}],total:2,page:1,page_size:20};
   else if(p==='/api/admin/users/1/role'){roleWrites.push(req.postDataJSON());d={success:true,message:'权限已更新'};}
   else if(p==='/api/notifications/preferences')d={wecom:1,new_orders:1,sound:0};
   else if(p==='/api/notifications/stream'){await r.fulfill({contentType:'text/event-stream',body:'event: snapshot\ndata: {"unread_count":0,"cursor":0,"notifications":[],"bootstrap":true}\n\n'});return;}
   else if(p==='/api/order-center')d={orders:[],summary:[],total:0,page:1};
   else if(['/api/shop/items','/api/rental/accounts','/api/admin/orders','/api/admin/custom-requests'].includes(p))d=[];
   await r.fulfill({json:d});
  });
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#supportLaunch').waitFor();await page.evaluate(()=>CustomerSupport.open(null,true));await page.locator('[data-support-conversation="11"]').click();await page.locator('#supportOrder').filter({hasText:'ORDER1'}).waitFor();assert.match(await page.locator('#supportOrder').innerText(),/代练中/);
  await page.locator('#supportQuick button').first().click();assert.match(await page.locator('#supportText').inputValue(),/您好/);await page.locator('#supportSend').click();await page.locator('#supportRetry').waitFor();await page.locator('#supportRetry').click();await page.waitForFunction(()=>document.getElementById('supportMessageStatus').textContent==='已发送');assert.equal(sent.length,2);assert.equal(sent[0].client_id,sent[1].client_id);assert.equal(chat.length,2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);const input=await page.locator('#supportCompose').boundingBox();assert.ok(input.y+input.height<=901);if(width<760){await page.setViewportSize({width,height:500});await page.locator('#supportText').focus();await page.waitForFunction(()=>document.getElementById('supportShell').classList.contains('support-compact'));const keyboardBox=await page.locator('#supportCompose').boundingBox();assert.ok(keyboardBox.y+keyboardBox.height<=501);await page.setViewportSize({width,height:900});}
  await page.locator('#supportResolve').click();await page.waitForFunction(()=>document.getElementById('supportConversationStatus').textContent==='已解决');await page.screenshot({path:path.join(out,`support-${theme}-${width}.png`)});
  if(width<760){await page.locator('#supportBack').click();await page.locator('#supportNotificationButton').click();await page.locator('#supportNotices').filter({hasText:'当前没有可接收企业微信提醒'}).waitFor();assert.match(await page.locator('#supportNotices').innerText(),/当前没有可接收企业微信提醒/);await page.locator('#supportNotificationButton').click();await page.locator('[data-support-conversation="11"]').click();}
  await page.locator('#supportClose').click();if(width<600){const launch=await page.locator('#supportLaunch').boundingBox(),nav=await page.locator('.mobile-nav').boundingBox();assert.ok(launch.y+launch.height<=nav.y);}
  if(role==='admin'){await page.evaluate(()=>showSection('admin'));await page.locator('[data-admintab=roles]').click();await page.locator('#permissionSearch').fill('玩家');await page.locator('[data-permission-user="1"]').waitFor();assert.equal(await page.locator('#permissionResults script').count(),0);await page.locator('[data-permission-user="1"]').click();assert.equal(await page.locator('#roleSelect').inputValue(),'user');await page.locator('#roleSelect').selectOption('support');await page.locator('#updateRoleBtn').click();await page.waitForFunction(()=>document.getElementById('roleUpdateMsg').textContent==='权限已更新');assert.deepEqual(roleWrites,[{role:'support',expected_role:'user'}]);await page.screenshot({path:path.join(out,`permissions-${theme}-${width}.png`)});await page.locator('#permissionSearch').fill('');await page.locator('#permissionBrowse').click();await page.locator('[data-permission-user="1"]').waitFor();}
  assert.deepEqual(errors,[]);console.log(`${theme} ${width}: chat, retry ID, queue, order, mobile bounds and permissions passed.`);await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#supportLaunch').waitFor();assert.equal(await page.locator('#supportStaffButton').isVisible(),false);await context.close();
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
