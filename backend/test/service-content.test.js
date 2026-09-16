'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {defaults,validateProjects,validateActivities,published,quote}=require('../lib/service-content');
const clone=()=>structuredClone(defaults),doc=()=>({revision:4,...clone()});
const order=()=>({catalog_revision:4,project_key:'silver',option_key:'a',quantity:3,player_type:'budget',urgent:true,client_type:'Android',use_credits:100,price:7.8,total_price:23.17});
test('catalog edits reject unavailable selections, duplicate keys, hidden-only projects and fractional prices',()=>{
 assert.equal(validateProjects(clone().projects).length,7);
 for(const mutate of [p=>p.push(p[0]),p=>p.forEach(v=>v.enabled=false),p=>p[0].options.forEach(o=>o.enabled=false),p=>p[0].options[0].price=1.001,p=>p[0].options[0].price=NaN]){const p=clone().projects;mutate(p);assert.throws(()=>validateProjects(p));}
});
test('activity visibility follows server time, end boundary and availability of associated services',()=>{
 const data=doc(),now=Date.parse('2026-09-17T00:00:00Z');const base={kind:'game',title:'真实活动由管理员配置',description:'活动说明',enabled:true,starts_at:new Date(now-1000).toISOString(),ends_at:new Date(now+1000).toISOString(),project_key:'silver',option_key:'a',source_url:'https://example.invalid/event'};
 data.activities=validateActivities([{...base,id:'active'},{...base,id:'future',starts_at:new Date(now+500).toISOString()},{...base,id:'ended',ends_at:new Date(now).toISOString()},{...base,id:'draft',enabled:false}],data.projects);
 assert.deepEqual(published(data,now).activities.map(a=>[a.id,a.can_order]),[['active',true]]);
 data.projects[0].enabled=false;assert.equal(published(data,now).activities[0].can_order,false);
 assert.throws(()=>validateActivities([{...base,id:'bad',source_url:'javascript:alert(1)'}],data.projects));
 assert.throws(()=>validateActivities([{...base,id:'bad',ends_at:base.starts_at}],data.projects));
 assert.throws(()=>validateActivities([{...base,id:'bad',project_key:'missing'}],data.projects));
});
test('quotes use current server pricing, reject stale pages and tampering before charging credits',()=>{
 const data=doc(),body=order();assert.deepEqual(quote(data,body),{project:'银币',detail:'A - 有紫狗牌有高级银币/百万',price:7.8,gross:23.17,player_name:'特惠打手'});
 for(const change of [{catalog_revision:3},{total_price:1},{price:.01},{quantity:1.2},{player_type:'admin'},{use_credits:-1},{urgent:'false'}])assert.throws(()=>quote(data,{...body,...change}));
 data.projects[0].options[0].enabled=false;assert.throws(()=>quote(data,body));
});
test('legacy pages remain compatible only when the requested labels and prices match active server configuration',()=>{
 const body=order();delete body.catalog_revision;delete body.project_key;delete body.option_key;Object.assign(body,{project:'银币',detail:'A - 有紫狗牌有高级银币/百万'});assert.equal(quote(doc(),body).gross,23.17);
 const data=doc();data.projects[0].options[0].price=9;assert.throws(()=>quote(data,body));
});
