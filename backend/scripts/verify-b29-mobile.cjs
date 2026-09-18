'use strict';
// Synthetic orders and API responses; never writes production business data.
const assert=require('node:assert/strict'),express=require('express'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const app=express();app.use(express.static(path.resolve(__dirname,'../../public')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const origin=process.env.B29_ORIGIN||`http://127.0.0.1:${server.address().port}`,out=path.resolve(__dirname,'../../artifacts/ui-preview/b29');fs.mkdirSync(out,{recursive:true});
 if(process.env.B29_ORIGIN)assert.equal(origin,'https://wotbqydailian.vip');
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{for(const theme of ['dark','light'])for(const width of [320,390,430,600,650,760,1440]){
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(theme=>{for(const [k,v]of Object.entries({theme,token:'fixture',role:'admin',userId:'1',username:'手机验收'}))localStorage.setItem(k,v);},theme);
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.route('**/api/**',async r=>{const p=new URL(r.request().url()).pathname;let d={};
   if(p==='/api/service-content')d=require('../lib/service-content').published({revision:1,...require('../lib/service-content').defaults});
   else if(p==='/api/third-party-orders')d=Array.from({length:30},(_,i)=>({order_no:'TP1789626878196D5C'+i,platform:'其他服务器',content:'mk1活动，45场胜利（180代币）',price:35,creator_name:'测试玩家',creator_id:1,account_info:'MaskedAccount',workflow_stage:'awaiting_acceptance',payment_status:'paid',expected_at:'2026-09-19T00:00:00Z'}));
   else if(p==='/api/support/settings')d={is_staff:true,is_admin:true,open:true};
   else if(p.endsWith('/stream')){await r.fulfill({contentType:'text/event-stream',body:'event: sync\ndata: {}\n\n'});return;}
   else if(p==='/api/order-center')d={orders:[],summary:[],total:0,page:1};
   else if(/\/items$|\/accounts$|\/orders$|\/announcements$|\/news$/.test(p))d=[];
   await r.fulfill({json:d});
  });
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('#supportLaunch').waitFor();await page.evaluate(()=>showSection('boost'));await page.locator('#boostCheckoutBar').waitFor();await page.waitForTimeout(100);
  if(!process.env.B29_PROBE){
   const progress=await page.locator('.boost-progress').evaluate(el=>{const card=el.getBoundingClientRect();return {left:card.left,right:card.right,steps:[...el.querySelectorAll('span')].map(s=>{const b=s.getBoundingClientRect();return {left:b.left,right:b.right,center:(b.left+b.right)/2,height:b.height};})};});
   assert.equal(progress.steps.length,3);for(const step of progress.steps){assert.ok(step.left>=progress.left&&step.right<=progress.right,'Step exceeds progress card');assert.ok(step.height>=44,'Step touch target too short');}
   const [a,b,c]=progress.steps.map(s=>s.center);assert.ok(Math.abs((b-a)-(c-b))<=2,'Steps are unevenly spaced');
   if(width===1440||width===390)await page.locator('.boost-progress').screenshot({path:path.join(out,`${process.env.B29_ORIGIN?'live-':''}${theme}-${width}-progress.png`)});
  }
  const boost=await page.evaluate(()=>{const b=document.querySelector('#boostCheckoutBar').getBoundingClientRect(),s=document.querySelector('#supportLaunch').getBoundingClientRect(),n=document.querySelector('.mobile-nav').getBoundingClientRect();return {bar:{top:b.top,bottom:b.bottom},support:{top:s.top,bottom:s.bottom},nav:{top:n.top,height:n.height},overflow:document.documentElement.scrollWidth-innerWidth};});
  console.log(theme,width,'boost',JSON.stringify(boost));
  if(!process.env.B29_PROBE&&width<=700){assert.ok(boost.support.bottom<=boost.bar.top-7,'Support overlaps checkout');if(width<=600)assert.ok(boost.bar.bottom<=boost.nav.top,'Checkout overlaps navigation');}
  await page.screenshot({path:path.join(out,`${process.env.B29_ORIGIN?'live-':''}${theme}-${width}-boost.png`)});
  if(width<=700&&!process.env.B29_PROBE){
   await page.locator('#boostNext').click();await page.waitForTimeout(100);
   let boxes=await page.evaluate(()=>({bar:document.querySelector('#boostCheckoutBar').getBoundingClientRect().top,support:document.querySelector('#supportLaunch').getBoundingClientRect().bottom}));assert.ok(boxes.support<=boxes.bar-7,'Second step overlaps support');
   // A taller navigation bar models an added safe-area inset and verifies remeasurement.
   if(width<=600){await page.addStyleTag({content:'.mobile-nav{padding-bottom:24px;min-height:88px}'});await page.waitForTimeout(100);boxes=await page.evaluate(()=>({bar:document.querySelector('#boostCheckoutBar').getBoundingClientRect().bottom,nav:document.querySelector('.mobile-nav').getBoundingClientRect().top}));assert.ok(boxes.bar<=boxes.nav,'Changed navigation height overlaps checkout');}
  }
  await page.evaluate(()=>showSection('thirdparty'));await page.locator('.tp-order-card').last().waitFor();
  const tabs=await page.evaluate(()=>{const t=document.querySelector('.tp-filter-tabs');t.scrollLeft=10000;return {client:t.clientWidth,scroll:t.scrollWidth,left:t.scrollLeft,overflow:document.documentElement.scrollWidth-innerWidth,body:getComputedStyle(document.body).overflow};});
  console.log(theme,width,'tabs',JSON.stringify(tabs));
  if(!process.env.B29_PROBE){assert.ok(tabs.overflow<=1,'Workbench widens viewport');if(tabs.scroll>tabs.client)assert.ok(tabs.left>0,'Filters cannot scroll');}
  if(width<=430&&!process.env.B29_PROBE){
   await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('.tp-filter-tabs').scrollLeft=0;});await page.waitForTimeout(100);
   const box=await page.locator('.tp-filter-tabs').boundingBox(),cdp=await context.newCDPSession(page),y=box.y+box.height/2,start=box.x+box.width-12,end=box.x+12;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
   for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/8,y}]});await page.waitForTimeout(20);}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(150);
   assert.ok(await page.locator('.tp-filter-tabs').evaluate(t=>t.scrollLeft)>0,'Real touch swipe cannot scroll filters');await cdp.detach();
  }
  await page.locator('.tp-filter-tabs button').last().scrollIntoViewIfNeeded();
  const lastTab=await page.locator('.tp-filter-tabs button').last().boundingBox();if(!process.env.B29_PROBE)assert.ok(lastTab.x>=0&&lastTab.x+lastTab.width<=width+1,'Last filter is clipped');
  await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(width/2,600);await page.mouse.wheel(0,600);await page.waitForTimeout(100);if(!process.env.B29_PROBE)assert.ok(await page.evaluate(()=>scrollY)>0,'Page cannot scroll vertically');
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(100);
  const last=await page.locator('.tp-order-card').last().boundingBox(),support=await page.locator('#supportLaunch').boundingBox();if(!process.env.B29_PROBE&&width<=760)assert.ok(last.y+last.height<=support.y,'Last order is hidden under floating controls');
  await page.screenshot({path:path.join(out,`${process.env.B29_ORIGIN?'live-':''}${theme}-${width}-thirdparty.png`)});assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
