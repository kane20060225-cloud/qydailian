'use strict';
const {createHash}=require('node:crypto');
const {isIP}=require('node:net');
const digest=value=>createHash('sha256').update(value).digest('hex');
const normalizeAgent=value=>String(value||'').replace(/\d+(?:[._]\d+)+/g,'#').trim();
function deviceKey(userId,id,agent){
  const valid=typeof id==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(id);
  return digest(`${userId}:${valid?'device:'+id:'legacy:'+normalizeAgent(agent)}`);
}
function normalizeIp(value){const ip=String(value||'').replace(/^::ffff:/i,'');return isIP(ip)?ip:'';}
function isPublicIp(value){
  const ip=normalizeIp(value);if(!ip)return false;
  if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===192&&b===0||a===198&&(b===18||b===19)||a===198&&b===51||a===203&&b===0);}
  return /^[23][0-9a-f]{3}:/i.test(ip)&&!/^2001:(?:db8|0):/i.test(ip);
}
function collapseDevices(rows){
  const sorted=[...rows].sort((a,b)=>new Date(b.login_time)-new Date(a.login_time)||Number(b.id)-Number(a.id));
  const known=new Set(sorted.filter(r=>r.device_key).map(r=>normalizeAgent(r.device_info))),seen=new Set();
  return sorted.filter(r=>{const agent=normalizeAgent(r.device_info);if(!r.device_key&&known.has(agent))return false;const key=r.device_key||'legacy:'+agent;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,10);
}
function createLocator({fetchImpl=global.fetch,now=Date.now}={}){
  const cache=new Map();let day='',requests=0;
  return async value=>{
    const ip=normalizeIp(value);if(!ip)return '地点未知';if(!isPublicIp(ip))return '本地或专用网络';
    const hit=cache.get(ip);if(hit&&hit.until>now())return hit.value;
    const today=new Date(now()).toISOString().slice(0,10);if(today!==day){day=today;requests=0;}
    if(requests>=900)return '地点暂不可用';requests++;
    const pending=(async()=>{try{
      const response=await fetchImpl(`https://ipwho.is/${encodeURIComponent(ip)}?lang=zh-CN&fields=success,country,region,city`,{signal:AbortSignal.timeout(1800),redirect:'error'});
      if(!response.ok)throw Error();const data=await response.json();if(data.success!==true)throw Error();
      const parts=[data.country,data.region,data.city].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim().slice(0,60));
      const location=[...new Set(parts)].join(' · ')||'地点未知';cache.set(ip,{value:location,until:now()+86400000});return location;
    }catch{cache.set(ip,{value:'地点暂不可用',until:now()+60000});return '地点暂不可用';}})();
    if(cache.size>=1000)cache.delete(cache.keys().next().value);cache.set(ip,{value:pending,until:now()+3000});return pending;
  };
}
async function recordLogin(db,userId,deviceId,agent,ip){
  await db.execute(`INSERT INTO login_devices (user_id, device_key, device_info, ip_address) VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE device_info=VALUES(device_info),ip_address=VALUES(ip_address),login_time=CURRENT_TIMESTAMP`,
  [userId,deviceKey(userId,deviceId,agent),String(agent||'').slice(0,65535),normalizeIp(ip)]);
}
async function listDevices(db,userId,locate){
  const [rows]=await db.execute(`SELECT id,device_key,device_info,ip_address,login_time FROM (
    SELECT id,device_key,device_info,ip_address,login_time,ROW_NUMBER() OVER (
      PARTITION BY COALESCE(device_key,SHA2(COALESCE(device_info,''),256)) ORDER BY login_time DESC,id DESC) AS rn
    FROM login_devices WHERE user_id=?) AS latest WHERE rn=1 ORDER BY login_time DESC,id DESC LIMIT 100`,[userId]);
  return Promise.all(collapseDevices(rows).map(async row=>({device_info:row.device_info,ip_address:row.ip_address,login_time:row.login_time,login_location:await locate(row.ip_address)})));
}
async function initialize(db){
  const [columns]=await db.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='login_devices' AND COLUMN_NAME='device_key'");
  if(!columns.length)await db.execute('ALTER TABLE login_devices ADD COLUMN device_key CHAR(64) NULL AFTER user_id');
  const [indexes]=await db.execute("SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='login_devices' AND INDEX_NAME='uq_login_device'");
  if(!indexes.length)await db.execute('ALTER TABLE login_devices ADD UNIQUE KEY uq_login_device (user_id,device_key)');
}
module.exports={deviceKey,normalizeIp,isPublicIp,collapseDevices,createLocator,recordLogin,listDevices,initialize};
