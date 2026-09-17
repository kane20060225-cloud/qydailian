'use strict';
const express=require('express'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
(async()=>{
 const app=express();app.use(express.static(path.resolve(__dirname,'../../public')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({headless:true,channel:'msedge'});const origin=process.env.WORKBENCH_ORIGIN||'http://127.0.0.1:'+server.address().port;
 if(process.env.WORKBENCH_ORIGIN)assert.equal(origin,'https://wotbqydailian.vip');
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('token','fixture');localStorage.setItem('role','admin');});
  let pending=false,approved=false,posts=0;
  await page.route('**/api/**',async route=>{const url=new URL(route.request().url()),p=url.pathname;let data={};
   if(p==='/api/user/profile')data={id:7,role:'admin',booster_identity:'gold'};
   if(p==='/api/booster/my-orders')data=[{order_no:'TEST',project:'银币',detail:'高级银币',quantity:10,client_type:'iOS',status:approved?'done':'playing',completion_status:pending?'pending':null,earnings:52.65,settled_earnings:approved?52.65:null,created_at:new Date().toISOString()}];
   if(p==='/api/booster/complete/TEST'){posts++;assert.equal(route.request().headers()['content-type'],'image/png');assert.ok(route.request().postDataBuffer().equals(png));pending=true;data={success:true,message:'结单已提交，等待审核'};}
   if(p==='/api/admin/boost-completions')data=pending?[{id:1,order_no:'TEST',project:'银币',detail:'高级银币',total_price:70.2,booster_name:'测试打手',note:'<script>unsafe</script>'}]:[];
   if(p==='/api/boost-completions/1/image'){await route.fulfill({contentType:'image/png',body:png});return;}
   if(p==='/api/admin/boost-completions/1/review'){assert.equal(route.request().postDataJSON().decision,'approved');approved=true;pending=false;data={success:true,message:'审核通过，订单已完成并结算'};}
   if(p==='/api/order-center')data={orders:[],total:0,page:1,page_size:20,stats:{}};
   if(p==='/api/booster/hall')data=[];
   if(p==='/api/booster/availability')data={online:true,mode:'manual',manual_online:true,schedule:Array.from({length:7},()=>[])};
   if(p==='/api/service-content')data=require('../lib/service-content').published({revision:1,...require('../lib/service-content').defaults});
   await route.fulfill({json:data});
  });
  // Every business API call, including writes, is fulfilled above using fixtures.
  await page.goto(origin,{waitUntil:'networkidle'});await page.evaluate(()=>showSection('booster'));await page.locator('.booster-tab[data-tab="booster-my"]').click();
  await page.locator('.complete-order-btn').click();await page.locator('[name=image]').setInputFiles({name:'completion.png',mimeType:'image/png',buffer:png});await page.locator('[data-completion-form] button[type=submit]').click();
  await page.waitForFunction(()=>!document.getElementById('completionDialog').open);assert.equal(posts,1);await page.locator('[data-my-status=review]').click();await page.getByText('待审核结单',{exact:true}).waitFor();assert.equal(await page.locator('.complete-order-btn').count(),0);
  await page.evaluate(()=>{showSection('admin');BoostCompletion.loadAdmin();});await page.locator('[data-completion-review]').click();await page.locator('[value=approved]:enabled').waitFor();assert.equal(await page.locator('#boostCompletionQueue script').count(),0);
  await page.locator('[value=approved]').click();await page.waitForFunction(()=>!document.getElementById('completionDialog').open);assert.ok(approved);assert.equal(errors.length,0,errors.join('; '));
  await page.locator('#boostCompletionQueue').screenshot({path:path.resolve(__dirname,'../../artifacts/ui-preview/b27-completion-'+width+'.png')});await page.close();console.log(width+': screenshot submission, pending state, private preview and approval UI passed (fixture APIs only)');
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
