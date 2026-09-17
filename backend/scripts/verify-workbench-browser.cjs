'use strict';
// Fixture API responses only. Production mode loads live assets but never sends business writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
(async()=>{
 const app=express();app.use(express.static(path.resolve(__dirname,'../../public')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const origin=process.env.WORKBENCH_ORIGIN||`http://127.0.0.1:${server.address().port}`;if(process.env.WORKBENCH_ORIGIN)assert.equal(origin,'https://wotbqydailian.vip');
 const output=path.resolve(__dirname,'../../artifacts/ui-preview');fs.mkdirSync(output,{recursive:true});let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'msedge'});
  for(const theme of ['dark','light'])for(const width of [1440,768,390,320]){
   const context=await browser.newContext({viewport:{width,height:width<700?844:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await context.addInitScript(theme=>{localStorage.setItem('token','fixture');localStorage.setItem('role','admin');localStorage.setItem('username','测试打手');localStorage.setItem('theme',theme);},theme);
   let admin=true,reversed=false,range='7',requests=0,fail=false;
   const now=new Date().toISOString(),accounts=[{order_no:'WORKBENCH-TEST',project:'银币',detail:'A · 高级银币 / 百万',quantity:10,client_type:'iOS',required_identity:'budget',created_at:now,urgent:true,status:'pending',earnings:52.65},{order_no:'WORKBENCH-SECOND',project:'经验',detail:'<script>alert(1)</script>',quantity:2,client_type:'Android',required_identity:'standard',created_at:now,status:'pending',earnings:15}];
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
   await page.route('**/api/**',async route=>{
    const p=new URL(route.request().url()).pathname,q=new URL(route.request().url()).searchParams;let data={};
    if(p==='/api/user/profile')data={id:7,role:admin?'admin':'booster',booster_identity:'gold'};
    else if(p==='/api/booster/hall')data=accounts;
    else if(p==='/api/booster/my-orders')data=accounts.map((o,i)=>({...o,status:i===0?'playing':'done',settled_earnings:i===0?null:15,earnings_reversed:false}));
    else if(p==='/api/booster/finance'){
     requests++;range=q.get('range');if(fail){await route.fulfill({status:503,json:{error:'fixture unavailable'}});return;}
     data={admin,earnings:reversed?47.35:100,legacy_unlinked:47.35,summary:{net:reversed?0:52.65,income:52.65,deductions:reversed?52.65:0,total:reversed?2:1},pending:{orders:1,estimate:52.65},page:1,
      entries:[{id:1,order_no:'WORKBENCH-TEST',project:'银币',detail:'高级银币',total_price:70.2,amount_delta:52.65,order_income:1,source_type:'order',occurred_at:Date.now(),reversed},...(reversed?[{id:2,order_no:'WORKBENCH-TEST',project:'银币',amount_delta:-52.65,source_type:'booster_test_reversal',occurred_at:Date.now()}]:[])]};
    }else if(p.endsWith('/preview'))data={order_no:'WORKBENCH-TEST',booster_id:7,booster_name:'测试打手',amount:52.65,balance:100,original_ledger_id:'1',legacy:false,reversed:false,snapshot:'fixture-snapshot'};
    else if(p.endsWith('/reverse-test')){const body=route.request().postDataJSON();assert.equal(body.confirmation,'REVERSE_TEST_EARNINGS');assert.equal(body.snapshot,'fixture-snapshot');assert.equal(body.reason,'明确的测试订单');reversed=true;data={success:true};}
    else if(p==='/api/service-content')data=require('../lib/service-content').published({revision:1,...require('../lib/service-content').defaults});
    else if(p==='/api/booster/availability')data={online:true,mode:'manual',manual_online:true,schedule:Array.from({length:7},()=>[])};
    await route.fulfill({json:data});
   });
   await page.goto(origin,{waitUntil:'networkidle'});await page.evaluate(()=>showSection('booster'));await page.locator('#hallOrderList .bw-order-card').first().waitFor();
   assert.equal(await page.locator('#hallOrderList .bw-order-card').count(),2);assert.equal(await page.locator('#hallOrderList script').count(),0);
   await page.locator('#hallOrderList [name=client]').selectOption('iOS');assert.equal(await page.locator('#hallOrderList .bw-order-card').count(),1);await page.locator('#hallOrderList [name=client]').selectOption('');
   const screenshot=async tab=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(output,`${process.env.WORKBENCH_ORIGIN?'live-':''}workbench-b26-${theme}-${width}-${tab}.png`),fullPage:true});};
   await screenshot('hall');await page.locator('.booster-tab[data-tab=booster-my]').click();await page.locator('#myBoosterOrderList .bw-order-card').waitFor();assert.equal(await page.locator('#myBoosterOrderList .complete-order-btn').count(),1);
   await page.locator('[data-my-status=done]').click();assert.equal(await page.locator('#myBoosterOrderList .complete-order-btn').count(),0);assert.match(await page.locator('#myBoosterOrderList').textContent(),/已入账收益/);await screenshot('my');
   await page.locator('.booster-tab[data-tab=booster-earnings]').click();await page.locator('.bw-ledger-entry').waitFor();assert.equal(range,'7');await screenshot('earnings');
   await page.locator('[data-range="30"]').click();await page.waitForFunction(()=>document.querySelector('[data-range="30"]').classList.contains('active'));await page.waitForFunction(()=>document.querySelector('[data-finance-content]').getAttribute('aria-busy')==='false');assert.equal(range,'30');
   await page.locator('[data-range=custom]').click();await page.locator('.bw-date-form [name=from]').fill('2026-09-01');await page.locator('.bw-date-form [name=to]').fill('2026-09-17');await page.locator('.bw-date-form button').click();await page.locator('.bw-ledger-entry').waitFor();assert.equal(range,'custom');
   await page.locator('[data-preview]').click();await page.locator('#bwTestDialog [name=reason]').fill('明确的测试订单');await page.locator('#bwTestDialog [name=confirmed]').check();await page.locator('#bwTestDialog .bw-danger').click();await page.waitForFunction(()=>!document.getElementById('bwTestDialog').open);await page.waitForFunction(()=>document.querySelectorAll('.bw-ledger-entry').length===2);assert.equal(await page.locator('[data-preview]').count(),0);assert.match(await page.locator('.bw-ledger-list').textContent(),/−¥52.65/);
   admin=false;await page.locator('[data-finance-refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-finance-content]').getAttribute('aria-busy')==='false');assert.equal(await page.locator('.bw-admin-finance').count(),0);
   fail=true;await page.locator('[data-finance-refresh]').click();await page.waitForFunction(()=>document.querySelector('[data-finance-content]').textContent.includes('fixture unavailable'));fail=false;await page.locator('[data-finance-refresh]').click();await page.locator('.bw-ledger-entry').first().waitFor();assert.ok(requests>=6);assert.deepEqual(errors,[]);
   console.log(`${theme} ${width}: hall filters, my-order status, settled income, 7/30/custom dates, admin preview/reversal, role hiding and retries passed.`);await context.close();
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
