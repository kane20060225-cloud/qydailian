'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const devices=require('../lib/login-devices');
test('stable device identity survives browser upgrades and isolates users and devices',()=>{
 const id='abcdef0123456789abcdef';assert.equal(devices.deviceKey(1,id,'Chrome/100.1'),devices.deviceKey(1,id,'Chrome/130.2'));
 assert.notEqual(devices.deviceKey(1,id,'same'),devices.deviceKey(2,id,'same'));
 assert.notEqual(devices.deviceKey(1,id,'same'),devices.deviceKey(1,id+'b','same'));
 assert.equal(devices.deviceKey(1,null,'Chrome/100.1'),devices.deviceKey(1,null,'Chrome/130.2'));
});
test('history collapses legacy duplicates while preserving distinct known devices with identical agents',()=>{
 const rows=[{id:1,device_info:'Chrome/100.1',login_time:'2026-01-01'},{id:2,device_info:'Chrome/130.2',login_time:'2026-02-01'},{id:3,device_key:'a',device_info:'Chrome/131.3',login_time:'2026-03-01'},{id:4,device_key:'b',device_info:'Chrome/131.3',login_time:'2026-04-01'},{id:5,device_key:'a',device_info:'Chrome/132.3',login_time:'2026-05-01'}];
 assert.deepEqual(devices.collapseDevices(rows).map(r=>r.id),[5,4]);assert.deepEqual(devices.collapseDevices(rows.slice(0,2)).map(r=>r.id),[2]);
});
test('login upsert records latest IP and agent without affecting authentication',async()=>{
 let captured;await devices.recordLogin({execute:async(...args)=>captured=args},7,'abcdef0123456789','Chrome','::ffff:1.1.1.1');
 assert.match(captured[0],/ON DUPLICATE KEY UPDATE/);assert.match(captured[0],/login_time=CURRENT_TIMESTAMP/);assert.equal(captured[1][0],7);assert.equal(captured[1][3],'1.1.1.1');
});
test('IP lookup excludes private and invalid addresses; IPv4 and IPv6 public addresses supported',async()=>{
 const locate=devices.createLocator({fetchImpl:()=>{throw Error('must not fetch');}});
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.1.1','192.168.0.1','100.64.0.1','::1','fc00::1','fe80::1','2001:db8::1'])assert.equal(await locate(ip),'本地或专用网络');
 assert.equal(await locate('evil.invalid'),'地点未知');assert.equal(devices.isPublicIp('1.1.1.1'),true);assert.equal(devices.isPublicIp('2606:4700::1111'),true);
});
test('localized lookups deduplicate concurrent requests, cache successes and degrade on provider failures',async()=>{
 let calls=0,clock=Date.now();const locate=devices.createLocator({now:()=>clock,fetchImpl:async url=>{calls++;assert.match(url,/lang=zh-CN/);return {ok:true,json:async()=>({success:true,country:'中国',region:'上海市',city:'上海市'})};}});
 assert.deepEqual(await Promise.all([locate('1.1.1.1'),locate('1.1.1.1')]),['中国 · 上海市','中国 · 上海市']);assert.equal(calls,1);await locate('1.1.1.1');assert.equal(calls,1);
 const failed=devices.createLocator({fetchImpl:async()=>({ok:true,json:async()=>({success:false})})});assert.equal(await failed('8.8.8.8'),'地点暂不可用');
});
test('device list is scoped to authenticated user and exposes no internal key',async()=>{
 let params;const rows=await devices.listDevices({execute:async(sql,args)=>{params=args;assert.match(sql,/WHERE user_id=\?/);return [[{id:2,device_key:'secretkey',device_info:'Chrome',ip_address:'1.1.1.1',login_time:'2026-09-17'}]];}},9,async()=> '中国');
 assert.deepEqual(params,[9]);assert.equal(rows[0].login_location,'中国');assert.equal(rows[0].device_key,undefined);
});
