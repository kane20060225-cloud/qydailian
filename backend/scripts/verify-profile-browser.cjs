'use strict';
// Isolated fixture data; no production accounts or business writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const express=require('express'),{chromium}=require('playwright');
(async()=>{
 const app=express();app.use(express.static(path.resolve(__dirname,'../../public')));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const origin=process.env.PROFILE_ORIGIN||`http://127.0.0.1:${server.address().port}`,output=path.resolve(__dirname,'../../artifacts/ui-preview');fs.mkdirSync(output,{recursive:true});
 if(process.env.PROFILE_ORIGIN)assert.equal(origin,'https://wotbqydailian.vip');
 let browser;
 try {
  browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
  for(const theme of ['dark','light'])for(const width of [1440,768,390,320]){
   const context=await browser.newContext({viewport:{width,height:width<700?844:1100},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(theme=>{localStorage.setItem('theme',theme);localStorage.setItem('token','fixture');localStorage.setItem('username','测试玩家');localStorage.setItem('role','admin');},theme);
   let fail=false,role='admin',vip=4;
   await context.route('**/*',route=>new URL(route.request().url()).origin===origin&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
   await page.route('**/api/**',async route=>{
    if(new URL(route.request().url()).origin!==origin||!['GET','HEAD'].includes(route.request().method())){await route.abort();return;}
    const p=new URL(route.request().url()).pathname;let data={};
    if(p==='/api/user/profile'){
     if(fail){await route.fulfill({status:503,json:{error:'fixture failure'}});return;}
     data={id:7,username:'测试玩家',email:'long-email-address-for-responsive-layout@example.invalid',phone:'13800000000',reputation:100,referral_code:'QYTEST',booster_identity:'gold',booster_points:233054,created_at:'2026-06-29T11:49:36Z',role};
    }else if(p==='/api/user/credits')data={qy_credits:8319,total_earned_credits:vip===5?20000:9321,vip_level:vip};
    else if(p==='/api/service-content')data=require('../lib/service-content').published({revision:1,...require('../lib/service-content').defaults});
    else if(p==='/api/order-center')data={orders:[],summary:[],total:0,page:1};
    else if(p==='/api/shop/items')data=[];
    else if(p==='/api/rental/accounts')data=[];
    await route.fulfill({json:data});
   });
   await page.goto(origin,{waitUntil:'networkidle'});await page.evaluate(()=>showSection('profile'));
   await page.locator('.profile-balance strong').waitFor();assert.equal(await page.locator('.profile-balance strong').textContent(),'8,319');assert.match(await page.locator('.profile-membership').textContent(),/5,679/);
   assert.match(await page.locator('.profile-status-card').textContent(),/金牌打手/);await page.locator('.logo-icon img').evaluate(img=>img.decode());assert.equal(await page.locator('.logo-icon img').evaluate(img=>img.naturalWidth),256);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const boxes=await page.locator('.profile-overview-grid > section').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));
   assert.equal(width<700?boxes[1].y>boxes[0].y:boxes[1].x>boxes[0].x,true);
   await page.screenshot({path:path.join(output,`${process.env.PROFILE_ORIGIN?'live-':''}profile-b25-${theme}-${width}.png`),fullPage:true});
   await page.locator('#openShopBtn').click();assert.equal(await page.locator('#sectionQYShop').isVisible(),true);
   await page.evaluate(()=>showSection('profile'));await page.locator('#profileSettingsBtn').click();assert.equal(await page.locator('#sectionSettings').isVisible(),true);
   vip=5;role='user';await page.evaluate(()=>showSection('profile'));await page.waitForFunction(()=>document.querySelector('.profile-membership')?.textContent.includes('已达最高等级'));assert.equal(await page.locator('.profile-status-card').textContent().then(t=>t.includes('打手积分')),false);
   fail=true;await page.evaluate(()=>loadProfile());await page.locator('#retryProfileBtn').waitFor();fail=false;await page.locator('#retryProfileBtn').click();await page.locator('.profile-balance strong').waitFor();
   assert.deepEqual(errors,[]);console.log(`${theme} ${width}: profile layout, long fields, roles, max VIP, retry, icons and navigation passed.`);await context.close();
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
