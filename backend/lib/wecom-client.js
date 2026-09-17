'use strict';
const crypto=require('node:crypto');
const BASE='https://qyapi.weixin.qq.com';
const SECRET_CONTEXT='wecom_notification_config.corp_secret';
function apiError(code) {return Object.assign(new Error('企业微信接口暂不可用'),{code:`WECOM_${String(code).replace(/[^A-Z0-9_-]/gi,'').slice(0,50)}`});}
function validateConfig(body) {
  if(typeof body.enabled!=='boolean'|| !/^[A-Za-z0-9]{8,64}$/.test(body.corp_id||'') || !Number.isSafeInteger(body.agent_id)||body.agent_id<1||body.agent_id>4294967295 ||
    (body.corp_secret!==undefined && typeof body.corp_secret!=='string') || (body.corp_secret && !/^[A-Za-z0-9_-]{16,256}$/.test(body.corp_secret)))throw Object.assign(new Error('请填写有效的 CorpID、AgentID 和应用 Secret'),{status:400});
  return {corp_id:body.corp_id,agent_id:body.agent_id,corp_secret:body.corp_secret || '',enabled:body.enabled};
}
function createWecomClient({fetchImpl=fetch,now=Date.now}={}) {
  let cache=null,pending=null;
  async function request(url,body) {
    try {
      const response=await fetchImpl(url,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
      if(!response.ok)throw apiError(`HTTP_${response.status}`);
      const data=await response.json();if(data.errcode)throw apiError(data.errcode);return data;
    }catch(err){if(err.code?.startsWith('WECOM_'))throw err;throw apiError('NETWORK');}
  }
  function key(config){return crypto.createHash('sha256').update(`${config.corp_id}:${config.agent_id}:${config.secret}`).digest('hex');}
  async function token(config,refresh=false) {
    const configKey=key(config);if(!refresh&&cache?.key===configKey&&cache.expires>now())return cache.value;
    if(pending?.key===configKey)return pending.promise;
    const promise=(async()=>{const url=new URL('/cgi-bin/gettoken',BASE);url.searchParams.set('corpid',config.corp_id);url.searchParams.set('corpsecret',config.secret);
      const result=await request(url);if(typeof result.access_token!=='string'||!result.access_token)throw apiError('TOKEN');
      cache={key:configKey,value:result.access_token,expires:now()+Math.max(0,Math.min(Number(result.expires_in)||7200,7200)-120)*1000};return cache.value;})();
    pending={key:configKey,promise};try{return await promise;}finally{if(pending?.promise===promise)pending=null;}
  }
  async function call(config,path,params={},body) {
    for(let attempt=0;attempt<2;attempt++) {
      const url=new URL(path,BASE);url.searchParams.set('access_token',await token(config,attempt===1));for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
      try{return await request(url,body);}catch(err){if(attempt===0&&['WECOM_40014','WECOM_42001'].includes(err.code))continue;throw err;}
    }
  }
  return {token,
    async identity(config,code){const result=await call(config,'/cgi-bin/user/getuserinfo',{code});const id=result.UserId || result.userid;
      if(typeof id!=='string'|| !/^[A-Za-z0-9_@.-]{1,64}$/.test(id))throw apiError('NOT_ENTERPRISE_MEMBER');return id;},
    async send(config,userId,notification,siteUrl) {
      if(!/^[A-Za-z0-9_@.-]{1,64}$/.test(userId)||userId==='@all')throw apiError('RECIPIENT');
      const url=new URL('/',siteUrl);url.searchParams.set(notification.kind==='support_message'?'support_chat':'notify_order',notification.order_ref);
      url.searchParams.set('notify_kind',notification.kind || 'order_update');
      url.searchParams.set('notify_type',notification.order_type || 'boost');
      const result=await call(config,'/cgi-bin/message/send',{}, {touser:userId,agentid:config.agent_id,msgtype:'text',text:{content:`${notification.title}\n${notification.body}\n${notification.kind==='support_message'?'查看咨询':'查看订单'}：${url.href}`},enable_duplicate_check:1,duplicate_check_interval:1800});
      if(result.invaliduser || result.unlicenseduser)throw apiError('RECIPIENT_UNAVAILABLE');return result.msgid || null;
    }
  };
}
module.exports={createWecomClient,validateConfig,SECRET_CONTEXT};
