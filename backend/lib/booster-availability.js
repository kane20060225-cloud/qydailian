'use strict';
const DAY=86400000, WEEK=7*DAY, OFFSET=8*3600000;
const emptySchedule=()=>Array.from({length:7},()=>[]); // Monday through Sunday, Asia/Shanghai.
function bad(message){throw Object.assign(new Error(message),{status:400});}
function validateSchedule(value){
  if(!Array.isArray(value)||value.length!==7)bad('请设置周一至周日的排班');
  return value.map(day=>{
    if(!Array.isArray(day)||day.length>4)bad('每天最多设置四个时段');
    return day.map(slot=>{
      if(!slot||typeof slot!=='object'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.end)||slot.start===slot.end)bad('时段需填写有效且不同的开始、结束时间');
      return {start:slot.start,end:slot.end};
    });
  });
}
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
function scheduleIntervals(schedule,now){
  const shifted=new Date(now+OFFSET), weekday=(shifted.getUTCDay()+6)%7;
  const midnight=Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth(),shifted.getUTCDate())-OFFSET;
  const monday=midnight-weekday*DAY, intervals=[];
  for(let week=-1;week<=2;week++)schedule.forEach((slots,day)=>slots.forEach(slot=>{
    const start=monday+week*WEEK+day*DAY+minutes(slot.start)*60000;
    let end=monday+week*WEEK+day*DAY+minutes(slot.end)*60000;
    if(end<=start)end+=DAY;
    intervals.push([start,end]);
  }));
  intervals.sort((a,b)=>a[0]-b[0]);
  const merged=[];for(const interval of intervals){const last=merged.at(-1);if(last&&interval[0]<=last[1])last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);}return merged;
}
function dateMs(value){if(!value)return null;if(typeof value==='number'||/^\d+$/.test(String(value)))return Number(value);if(value instanceof Date)return value.getTime();return Date.parse(value);}
function settings(row={}){
  let schedule;try{schedule=validateSchedule(typeof row.weekly_schedule==='string'?JSON.parse(row.weekly_schedule):row.weekly_schedule||emptySchedule());}catch{schedule=emptySchedule();}
  return {mode:row.mode==='auto'?'auto':'manual',manual_online:Boolean(row.manual_online),weekly_schedule:schedule,
    override_online:row.override_online==null?null:Boolean(row.override_online),override_until:dateMs(row.override_until),
    admin_paused:Boolean(row.admin_paused),admin_pause_until:dateMs(row.admin_pause_until),admin_reason:row.admin_reason||''};
}
function evaluateAvailability(row,now=Date.now()){
  const config=settings(row),intervals=scheduleIntervals(config.weekly_schedule,now);
  const onlineAt=time=>{
    if(config.admin_paused&&(!config.admin_pause_until||time<config.admin_pause_until))return {online:false,source:'admin'};
    if(config.override_online!==null&&config.override_until&&time<config.override_until)return {online:config.override_online,source:'temporary'};
    return {online:config.mode==='auto'?intervals.some(([start,end])=>start<=time&&time<end):config.manual_online,source:config.mode};
  };
  const current=onlineAt(now),boundaries=new Set(intervals.flat().filter(t=>t>now&&t<=now+WEEK));
  for(const t of [config.override_until,config.admin_pause_until])if(t>now)boundaries.add(t);
  let next=null;for(const time of [...boundaries].sort((a,b)=>a-b)){const state=onlineAt(time);if(state.online!==current.online){next={at:new Date(time).toISOString(),online:state.online};break;}}
  return {...config,override_until:config.override_until?new Date(config.override_until).toISOString():null,
    admin_pause_until:config.admin_pause_until?new Date(config.admin_pause_until).toISOString():null,
    online:current.online,source:current.source,next_change:next,server_time:new Date(now).toISOString(),timezone:'Asia/Shanghai'};
}
async function loadAvailability(db,userId){const [rows]=await db.execute('SELECT * FROM booster_availability WHERE user_id=?',[userId]);return evaluateAvailability(rows[0]);}
async function onlineRecipients(db){const [rows]=await db.execute('SELECT * FROM booster_availability');const now=Date.now();return rows.filter(row=>evaluateAvailability(row,now).online).map(row=>Number(row.user_id)).filter(Number.isSafeInteger);}
function validateChange(body,now=Date.now()){
  if(!body||typeof body!=='object')bad('请填写工作状态');
  if(body.action==='configure'){
    if(!['manual','auto'].includes(body.mode)||typeof body.manual_online!=='boolean')bad('请选择手动或自动模式及工作状态');
    const weekly=validateSchedule(body.weekly_schedule);if(body.mode==='auto'&&!weekly.some(day=>day.length))bad('自动模式至少设置一个上线时段');
    return {mode:body.mode,manual_online:+body.manual_online,weekly_schedule:JSON.stringify(weekly),override_online:null,override_until:null};
  }
  if(body.action==='temporary'){
    if(typeof body.online!=='boolean')bad('请选择上线或下线');
    let until;
    if(body.until==='today'){const d=new Date(now+OFFSET);until=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1)-OFFSET;}
    else {if(![1,2,4,8].includes(body.hours))bad('临时状态可设置为1、2、4或8小时');until=now+body.hours*3600000;}
    return {override_online:+body.online,override_until:until};
  }
  if(body.action==='resume')return {override_online:null,override_until:null};
  bad('无效状态操作');
}
async function changeAvailability(conn,userId,actorId,change,action){
  await conn.execute('INSERT IGNORE INTO booster_availability (user_id) VALUES (?)',[userId]);
  await conn.execute('SELECT user_id FROM booster_availability WHERE user_id=? FOR UPDATE',[userId]);
  const keys=Object.keys(change);
  const allowed=['mode','manual_online','weekly_schedule','override_online','override_until','admin_paused','admin_pause_until','admin_reason'];
  if(!keys.length||keys.some(k=>!allowed.includes(k)))throw Error('Invalid availability fields');
  await conn.execute(`UPDATE booster_availability SET ${keys.map(k=>k+'=?').join(',')},updated_at=UTC_TIMESTAMP() WHERE user_id=?`,[...keys.map(k=>change[k]),userId]);
  await conn.execute('INSERT INTO booster_availability_events (user_id,actor_id,action,detail) VALUES (?,?,?,?)',[userId,actorId,action,JSON.stringify(change)]);
  // A break cancels queued new-order invitations. Existing-order notifications continue.
  if(change.override_online===0||change.manual_online===0&&change.mode==='manual'||change.admin_paused===1){
    await conn.execute("UPDATE notification_deliveries d JOIN order_notifications n ON n.id=d.notification_id SET d.status='skipped',d.last_error_code='BOOSTER_OFFLINE' WHERE n.user_id=? AND n.kind='new_order' AND d.status IN ('pending','retry')",[userId]);
  }
}
module.exports={emptySchedule,validateSchedule,evaluateAvailability,loadAvailability,onlineRecipients,validateChange,changeAvailability};
