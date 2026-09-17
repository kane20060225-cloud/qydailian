'use strict';
const {ORDER_UNION_SQL,STATES}=require('./order-center');
const staffRole=role=>['support','admin'].includes(role);
const fail=(status,message)=>Object.assign(new Error(message),{status});
function messageInput(body={}) {
 if(!/^[A-Za-z0-9_-]{16,64}$/.test(body.client_id||''))throw fail(400,'消息编号无效');
 const text=typeof body.body==='string'?body.body.trim():'';
 if(text.length>2000)throw fail(400,'文字最多2000字');
 if(!text&&!body.image)throw fail(400,'请输入消息或选择截图');
 return {client_id:body.client_id,body:text,image:body.image};
}
async function orderSummary(db,type,ref,userId,staff=false) {
 if(!type&&!ref)return null;
 if(!['boost','rental','recharge','shop','third_party'].includes(type)||typeof ref!=='string'||ref.length>64)throw fail(400,'订单关联无效');
 const [rows]=await db.execute(`SELECT order_type,order_ref,title,amount,amount_unit,state,customer_id,related_user_id FROM (${ORDER_UNION_SQL}) safe_order WHERE order_type=? AND order_ref=?`,[type,ref]);
 const row=rows[0];if(!row||(!staff&&Number(row.customer_id)!==userId&&Number(row.related_user_id)!==userId))throw fail(404,'订单不存在或无权关联');
 // Explicit allowlist; never expose credentials, contact details or payment references.
 return {order_type:row.order_type,order_ref:row.order_ref,title:type==='third_party'?'第三方订单':row.title,amount:row.amount,amount_unit:row.amount_unit,state_label:STATES[type]?.[row.state]||row.state};
}
async function queueSupportNotification(db,{conversationId,messageId,customerId,fromStaff,testUserId}) {
 const key=`support:${testUserId?'test':messageId}:${conversationId}`;
 const recipient=testUserId?'u.id=?':fromStaff?'u.id=?':"u.role IN ('support','admin')";
 const params=[key,testUserId?'客服上线测试提醒':fromStaff?'客服已回复':'有新的客服咨询',testUserId?'这是管理员主动发送的客服提醒链路测试，无需处理订单。':fromStaff?'你的咨询收到回复，请进入聊天查看。':'有用户留言，请进入客服工作台处理。',String(conversationId),...(testUserId?[testUserId]:fromStaff?[customerId]:[])];
 await db.execute(`INSERT IGNORE INTO order_notifications (user_id,event_key,kind,title,body,order_type,order_ref) SELECT u.id,?,'support_message',?,?,'support',? FROM users u WHERE ${recipient}`,params);
 await db.execute(`INSERT IGNORE INTO notification_deliveries (notification_id) SELECT n.id FROM order_notifications n JOIN wecom_user_bindings b ON b.user_id=n.user_id JOIN wecom_notification_config c ON c.id=1 AND c.enabled=1 AND c.corp_id=b.corp_id AND c.agent_id=b.agent_id LEFT JOIN notification_preferences p ON p.user_id=n.user_id WHERE n.event_key=? AND COALESCE(p.wecom,1)=1`,[key]);
}
module.exports={staffRole,fail,messageInput,orderSummary,queueSupportNotification};
