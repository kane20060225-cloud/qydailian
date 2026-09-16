'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),express=require('express'),{chromium}=require('playwright');
(async()=>{const app=express();app.use(express.static(path.join(__dirname,'../../public')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));let browser;
try{browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
for(const theme of ['dark','light'])for(const width of [1440,390]){const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();let fail=false,metricsCalls=0;
await context.addInitScript(theme=>{for(const [key,value]of Object.entries({theme,token:'synthetic',role:'admin',username:'验收',userId:'7'}))localStorage.setItem(key,value);},theme);
await page.route('**/api/**',async route=>{const p=new URL(route.request().url()).pathname;let data={},status=200;
if(p==='/api/service-content')data={...require('../../public/service-defaults'),revision:1,catalog_revision:1,server_time:new Date().toISOString()};
else if(p==='/api/user/devices'){status=fail?503:200;data=fail?{error:'读取失败，请重试'}:[{device_info:'Mozilla/5.0 (Windows NT 10.0) Edg/130.0',ip_address:'1.1.1.1',login_time:'2026-09-17T08:00:00Z',login_location:'中国 · 上海市 <img src=x onerror=alert(1)>'}];}
else if(p==='/api/user/profile')data={id:7,username:'验收',role:'admin'};
else if(p==='/api/order-center')data={orders:[],total:0,page:1,summary:[]};
else if(p==='/api/order-center/metrics'){metricsCalls++;data={assignment_hours:9};}
else if(p==='/api/user/messages')data=[];
await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});});
await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
const key=await page.evaluate(()=>getLoginDeviceId());await page.reload({waitUntil:'networkidle'});assert.equal(await page.evaluate(()=>getLoginDeviceId()),key);
await page.evaluate(()=>showSection('admin'));await page.locator('#adminOrderCenter [data-show-metrics]').waitFor();await page.waitForFunction(()=>!document.querySelector('#adminOrderList').hasAttribute('aria-busy'));assert.equal(metricsCalls,0);assert.equal(await page.locator('[data-metrics]').count(),0);
await page.locator('[data-show-metrics]').click();await page.locator('[data-metrics]').filter({hasText:'9 小时'}).waitFor();assert.equal(metricsCalls,1);await page.locator('#ocClose').click();
await page.evaluate(()=>showSection('settings'));await page.locator('[data-setting="devices"]').click();await page.locator('.login-device-card').waitFor();
assert.match(await page.locator('.login-device-card').textContent(),/Windows · Edge/);assert.match(await page.locator('.login-device-card').textContent(),/16:00:00/);assert.equal(await page.locator('.login-device-card img').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
fail=true;await page.locator('[data-setting="devices"]').click();await page.locator('#retryLoginDevices').waitFor();fail=false;await page.locator('#retryLoginDevices').click();await page.locator('.login-device-card').waitFor();
console.log('Device settings, stable ID, escaping, latest Beijing time, retry and lazy metrics passed: '+theme+' '+width);await context.close();}
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
