'use strict';
const defaults=require('../../public/service-defaults');
const rates={gold:1.2,silver:1.1,standard:1,budget:.9},names={gold:'金牌打手',silver:'银牌打手',standard:'标准打手',budget:'特惠打手'};
function error(message,status=400){return Object.assign(new Error(message),{status});}
function text(value,max,label){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw error(label+'不能为空且不能超过'+max+'字');return value.trim();}
function validateProjects(input){
 if(!Array.isArray(input)||input.length<1||input.length>30)throw error('请保留1到30个项目');const keys=new Set();
 const result=input.map(p=>{if(!p||! /^[a-z][a-z0-9_-]{0,31}$/.test(p.key)||keys.has(p.key))throw error('项目标识重复或无效');keys.add(p.key);
 if(typeof p.enabled!=='boolean')throw error('项目上架状态无效');
 if(!Array.isArray(p.options)||p.options.length!==3)throw error('每个项目需要方案A、B、C');
 const options=p.options.map((o,i)=>{if(!o||o.key!==['a','b','c'][i]||typeof o.enabled!=='boolean'||typeof o.price!=='number'||!Number.isFinite(o.price)||o.price<.01||o.price>100000||Math.abs(o.price*100-Math.round(o.price*100))>1e-6)throw error('方案价格需为0.01至100000元，最多两位小数');return {key:o.key,desc:text(o.desc,90,'方案说明'),price:o.price,enabled:o.enabled};});
 if(p.enabled&&!options.some(o=>o.enabled))throw error('已上架项目至少保留一个可选方案');
 return {key:p.key,name:text(p.name,50,'项目名称'),icon:text(p.icon,12,'项目图标'),description:text(p.description,80,'项目简介'),enabled:p.enabled,options};});
 if(new Set(result.map(p=>p.name)).size!==result.length)throw error('项目名称不能重复');
 if(!result.some(p=>p.enabled))throw error('至少保留一个上架项目');return result;
}
function validateActivities(input,projects){
 if(!Array.isArray(input)||input.length>40)throw error('最多保留40个活动');const keys=new Set();
 return input.map(a=>{if(!a||! /^[a-zA-Z0-9_-]{1,48}$/.test(a.id)||keys.has(a.id))throw error('活动标识重复或无效');keys.add(a.id);
 if(!['game','platform'].includes(a.kind)||typeof a.enabled!=='boolean')throw error('活动类型或发布状态无效');
 const start=new Date(a.starts_at),end=new Date(a.ends_at);if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw error('请填写有效起止时间，结束时间应晚于开始时间');
 let source_url=String(a.source_url||'').trim();if(source_url){try{const u=new URL(source_url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error();source_url=u.href;if(source_url.length>500)throw Error();}catch{throw error('活动来源链接需为有效的http或https地址');}}
 const project=projects.find(p=>p.key===a.project_key),option=project?.options.find(o=>o.key===a.option_key);
 if(a.project_key&&(!project||!option))throw error('关联项目或方案不存在，请重新选择');
 return {id:a.id,kind:a.kind,title:text(a.title,60,'活动标题'),description:text(a.description,280,'活动说明'),starts_at:start.toISOString(),ends_at:end.toISOString(),source_url,project_key:a.project_key||'',option_key:a.project_key?a.option_key:'',enabled:a.enabled};
 });
}
async function initialize(db){
 await db.execute(`CREATE TABLE IF NOT EXISTS site_service_content (id TINYINT UNSIGNED PRIMARY KEY, revision INT UNSIGNED NOT NULL DEFAULT 1, document JSON NOT NULL, updated_by INT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
 await db.execute('INSERT IGNORE INTO site_service_content (id,document) VALUES (1,?)',[JSON.stringify({catalog_revision:1,...defaults})]);
}
async function read(db,lock=false){const [rows]=await db.execute('SELECT revision, document, updated_at FROM site_service_content WHERE id=1'+(lock?' FOR UPDATE':''));if(!rows.length)throw error('项目配置暂不可用，请稍后重试',503);const row=rows[0];return {revision:row.revision,...(typeof row.document==='string'?JSON.parse(row.document):row.document),updated_at:row.updated_at};}
function published(doc,now=Date.now()){
 const projects=doc.projects.filter(p=>p.enabled).map(p=>({...p,options:p.options.filter(o=>o.enabled)}));
 const activities=doc.activities.filter(a=>a.enabled&&+new Date(a.starts_at)<=now&&now<+new Date(a.ends_at)).sort((a,b)=>+new Date(a.ends_at)-+new Date(b.ends_at)).map(a=>({...a,can_order:projects.some(p=>p.key===a.project_key&&p.options.some(o=>o.key===a.option_key))}));
 return {revision:doc.revision,catalog_revision:doc.catalog_revision||doc.revision,projects,activities,updated_at:doc.updated_at,server_time:new Date(now).toISOString()};
}
function quote(doc,body){
 if(body.catalog_revision!==undefined&&body.catalog_revision!==(doc.catalog_revision||doc.revision))throw error('项目或价格已更新，请刷新后重新确认订单',409);
 const project=doc.projects.find(p=>p.enabled&&(body.project_key?p.key===body.project_key:p.name===body.project));
 const option=project?.options.find(o=>o.enabled&&(body.option_key?o.key===body.option_key:`${o.key.toUpperCase()} - ${o.desc}`===body.detail));
 if(!project||!option)throw error('所选项目或方案已下架，请重新选择',409);
 const rate=rates[body.player_type||'standard'];if(!rate||!Number.isInteger(body.quantity)||body.quantity<1||body.quantity>99||typeof body.urgent!=='boolean'||!['Android','iOS'].includes(body.client_type||'Android')||!Number.isInteger(body.use_credits||0)||(body.use_credits||0)<0)throw error('订单数量、打手类别、客户端或积分无效');
 const gross=Math.round(option.price*body.quantity*rate*(body.urgent?1.1:1)*100)/100;
 if(typeof body.price!=='number'||typeof body.total_price!=='number'||!Number.isFinite(body.total_price)||Math.abs(body.price-option.price)>1e-6||Math.abs(body.total_price-gross)>1e-6)throw error('订单价格已变化，请刷新后重新确认',409);
 return {project:project.name,detail:`${option.key.toUpperCase()} - ${option.desc}`,price:option.price,gross,player_name:names[body.player_type||'standard']};
}
module.exports={defaults,error,validateProjects,validateActivities,initialize,read,published,quote};
