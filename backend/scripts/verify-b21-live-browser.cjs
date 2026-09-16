'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const origin='https://wotbqydailian.vip',output=path.resolve(__dirname,'../../artifacts/ui-preview/b21-live');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
 try{for(const theme of ['light','dark'])for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(theme=>localStorage.setItem('theme',theme),theme);
  await context.route('**/*',route=>{const request=route.request();return new URL(request.url()).origin===origin&&['GET','HEAD'].includes(request.method())?route.continue():route.abort();});
  await page.goto(origin+'/?verify=b21',{waitUntil:'networkidle'});await page.waitForFunction(()=>ServiceContent.ready);await page.evaluate(()=>showSection('boost'));
  const main=await page.locator('.boost-container').boundingBox();assert.ok(Math.abs(main.x-(viewport.width-main.x-main.width))<2,'symmetric live checkout margins');
  await page.locator('#boostActivitiesButton').click();await page.waitForFunction(()=>ServiceContent.ready);await page.locator('#boostActivitiesDialog').waitFor({state:'visible'});
  const modal=await page.locator('#boostActivitiesDialog').boundingBox();assert.ok(Math.abs(modal.x-(viewport.width-modal.x-modal.width))<2,'centered live modal');
  assert.equal(await page.locator('#boostActivitiesDialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  const columns=await page.locator('#boostActivities .activity-list').count();if(columns)assert.equal(await page.locator('#boostActivities .activity-list').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
  await page.waitForFunction(()=>!document.querySelector('.toast-message'));await page.screenshot({path:path.join(output,theme+'-'+viewport.width+'-dialog.png')});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#boostActivitiesDialog').isVisible(),false);await page.screenshot({path:path.join(output,theme+'-'+viewport.width+'-checkout.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  console.log('Live GET-only verification passed: '+theme+' '+viewport.width);await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
