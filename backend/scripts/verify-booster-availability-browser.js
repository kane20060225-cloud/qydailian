'use strict';
// All API traffic is intercepted. This never sends messages or changes a production account.
const assert=require('node:assert/strict'),path=require('node:path'),express=require('express');
const {chromium}=require('playwright');
const {evaluateAvailability,validateChange,emptySchedule}=require('../lib/booster-availability');
(async()=>{
 let server,browser;
 try{
  let origin=process.env.NAV_ORIGIN;
  if(!origin){const app=express();app.use(express.static(path.join(__dirname,'..','..','public')));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin=`http://127.0.0.1:${server.address().port}`;}
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  for(const width of [1440,1200,390,320]){
   const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage(),errors=[];
   let row={mode:'manual',manual_online:0,weekly_schedule:emptySchedule()},writes=0,adminWrites=0;
   const mine=()=>({...evaluateAvailability(row),active_orders:2,wecom_bound:true,reminder_status:evaluateAvailability(row).online?'ready':'offline'});
   const rows=()=>[{...mine(),id:7,username:'模拟打手A',role:'booster',booster_identity:'gold',booster_points:12000},{...evaluateAvailability(),id:8,username:'模拟打手B',role:'booster',booster_identity:'standard',booster_points:500,active_orders:0,wecom_bound:false}];
   page.on('pageerror',err=>errors.push(err.message));
   await context.addInitScript(()=>{localStorage.setItem('token','synthetic-b13-layout');localStorage.setItem('role','admin');localStorage.setItem('userId','7');localStorage.setItem('username','布局验证');});
   await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
    const p=url.pathname;let data=[];
    if(p==='/api/booster/availability'){
     if(req.method()==='PUT'){row={...row,...validateChange(req.postDataJSON())};writes++;}data=mine();
    }else if(p==='/api/admin/booster-availability')data=rows();
    else if(p==='/api/admin/booster-availability/7'&&req.method()==='PUT'){
     const b=req.postDataJSON();row={...row,admin_paused:+b.paused,admin_reason:b.reason,admin_pause_until:b.hours?Date.now()+b.hours*3600000:null};adminWrites++;data=mine();
    }else if(p.endsWith('/availability/events')||p.endsWith('/7/events'))data=[{action:'configure',detail:'{}',created_at:new Date().toISOString(),actor_name:'布局验证'}];
    else if(p==='/api/user/profile')data={id:7,username:'布局验证',role:'admin',booster_identity:'gold',balance:0,qy_credits:0,chest_tickets:0};
    else if(p==='/api/user/credits')data={qy_credits:0};
    else if(p==='/api/chest/tickets')data={tickets:0};
    else if(p==='/api/service-content')data={...require('../../public/service-defaults'),revision:1,catalog_revision:1,server_time:new Date().toISOString()};
    else if(p==='/api/user/settings')data={};
    else if(p==='/api/order-center')data={orders:[],total:0,page:1,page_size:25,summary:[]};
    else if(p==='/api/notifications/wecom/config')data={deliveries:[]};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
   });
   await page.goto(origin,{waitUntil:'domcontentloaded'});await page.evaluate(()=>showSection('booster'));
   assert.equal(await page.locator('#boosterAvailabilityCard').isVisible(),false);for(const tab of ['booster-my','booster-earnings','booster-hall']){await page.locator('.booster-tab[data-tab="'+tab+'"]').click();assert.equal(await page.locator('#boosterAvailabilityCard').isVisible(),false);}await page.locator('.booster-tab[data-tab="booster-availability"]').click();await page.locator('#boosterAvailabilityCard').filter({hasText:'当前离线'}).waitFor();
   await page.locator('[data-availability="toggle"]').click();await page.locator('#boosterAvailabilityCard').filter({hasText:'当前在线'}).waitFor();
   await page.locator('[data-availability="toggle"]').click();await page.locator('#boosterAvailabilityCard').filter({hasText:'当前离线'}).waitFor();
   await page.locator('.booster-tab[data-tab="booster-availability"]').click();
   await page.locator('[data-day="0"] [data-add-slot]').click();
   await page.locator('[data-day="0"] [data-slot="start"]').fill('22:00');await page.locator('[data-day="0"] [data-slot="end"]').fill('02:00');
   await page.locator('[data-copy="all"]').click();
   assert.equal(await page.locator('.availability-slot').count(),7);
   await page.locator('#boosterScheduleForm [name="mode"]').selectOption('auto');
   await page.locator('#boosterScheduleForm [type="submit"]').click();
   await page.locator('#boosterAvailabilityCard').filter({hasText:'自动排班'}).waitFor();
   assert.equal(row.mode,'auto');assert.equal(JSON.parse(row.weekly_schedule)[6][0].end,'02:00');
   await page.locator('[data-availability="temporary-online"]').click();await page.locator('#boosterAvailabilityCard').filter({hasText:'临时上线至'}).waitFor();
   assert.equal(mine().online,true);
   await page.locator('[data-availability="rest"]').click();await page.locator('#boosterAvailabilityCard').filter({hasText:'临时休息至'}).waitFor();assert.equal(mine().online,false);
   await page.locator('[data-availability="resume"]').click();await page.locator('#boosterAvailabilityCard').filter({hasText:'自动排班'}).waitFor();
   // Dirty timetable must prompt before leaving and keep the editor if cancelled.
   await page.locator('[data-day="0"] [data-slot="end"]').fill('03:00');
   page.once('dialog',dialog=>dialog.dismiss());await page.locator('.logo-area').click();assert.equal(await page.locator('body').getAttribute('data-current-section'),'booster');
   page.once('dialog',dialog=>dialog.accept());await page.locator('.logo-area').click();assert.equal(await page.locator('body').getAttribute('data-current-section'),'mainMenu');
   await page.evaluate(()=>showSection('admin'));await page.locator('.admin-tab[data-admintab="boosters"]').click();
   await page.locator('#availabilityAdminCards article').first().waitFor();assert.equal(await page.locator('#availabilityAdminCards article').count(),2);
   await page.locator('#availabilityFilter').selectOption('unbound');assert.equal(await page.locator('#availabilityAdminCards article').count(),1);
   await page.locator('#availabilityFilter').selectOption('');
   await page.locator('[data-pause="7"]').click();await page.locator('[data-pause-reason]').fill('休息中');
   await page.locator('[data-confirm-pause="7"]').click();await page.locator('#availabilityAdminCards').filter({hasText:'暂停：休息中'}).waitFor();
   assert.equal(mine().source,'admin');assert.equal(mine().online,false);assert.equal(adminWrites,1);
   await page.locator('[data-events="7"]').click();await page.locator('#availabilityEvents7').filter({hasText:'修改工作设置'}).waitFor();
   await page.evaluate(()=>showSection('booster'));await page.locator('#boosterAvailabilityCard').filter({hasText:'管理员暂停原因：休息中'}).waitFor();assert.equal(await page.locator('[data-availability="toggle"]').isDisabled(),true);
   await page.locator('.booster-tab[data-tab="booster-availability"]').click();await page.locator('#boosterScheduleForm').waitFor();
   for(const theme of ['default','light']){
    await page.evaluate(theme=>document.body.classList.toggle('theme-light',theme==='light'),theme);await page.waitForTimeout(200);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    if(overflow)console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({id:e.id,class:e.className,right:e.getBoundingClientRect().right}))));
    assert.equal(overflow,false,'Page overflow at '+width+'px, '+theme);
   }
   if(process.env.NAV_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.NAV_SCREENSHOT_DIR,`b13-${width}.png`)});
   assert.ok(writes>=6);assert.deepEqual(errors,[]);console.log(`Working status, schedules, temporary breaks, admin pause, dirty edits and themes passed: ${width}px`);
   await context.close();
  }
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
})().catch(err=>{console.error(err);process.exitCode=1;});
