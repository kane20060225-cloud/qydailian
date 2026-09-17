'use strict';
const crypto = require('node:crypto');
const {postAccountDelta,recordOperation} = require('./accounting');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const cents=value=>Math.round(Number(value)*100);
function date(value) {
 const parsed=typeof value==='string'?Date.parse(value+'T00:00:00Z'):NaN;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==value)fail('日期格式无效');
 return Date.parse(value+'T00:00:00+08:00')/1000;
}
function filters(query={},now=Date.now()) {
 const range=query.range||'7',page=Number(query.page||1);
 if(!['7','30','all','custom'].includes(range)||!Number.isSafeInteger(page)||page<1||page>100000)fail('收益筛选无效');
 let from=null,to=null;
 if(range==='custom') {from=date(query.from);to=date(query.to)+86400;if(to<=from||to-from>366*86400)fail('请选择有效日期范围，最多366天');}
 else if(range!=='all') {const today=new Date(now+8*3600000).toISOString().slice(0,10);from=date(today)-(Number(range)-1)*86400;to=date(today)+86400;}
 return {range,from,to,page};
}
async function earningsRead(pool,userId,query) {
 const f=filters(query),params=[userId];let where="l.user_id=? AND l.account_type='earnings'";
 if(f.from!==null){where+=' AND l.created_at>=FROM_UNIXTIME(?) AND l.created_at<FROM_UNIXTIME(?)';params.push(f.from,f.to);}
 const [users]=await pool.execute('SELECT earnings,role FROM users WHERE id=?',[userId]);if(!users.length)fail('账户不存在',404);
 const [summary]=await pool.execute(`SELECT COALESCE(SUM(CASE WHEN l.amount_delta>0 THEN l.amount_delta ELSE 0 END),0) AS income,
 COALESCE(SUM(CASE WHEN l.amount_delta<0 THEN -l.amount_delta ELSE 0 END),0) AS deductions,
 COALESCE(SUM(l.amount_delta),0) AS net,COUNT(*) AS total FROM account_ledger l WHERE ${where}`,params);
 const [tracked]=await pool.execute("SELECT COALESCE(SUM(amount_delta),0) AS net FROM account_ledger WHERE user_id=? AND account_type='earnings'",[userId]);
 const [pending]=await pool.execute("SELECT COUNT(*) AS orders,COALESCE(SUM(ROUND(total_price*0.75,2)),0) AS estimate FROM orders WHERE booster_id=? AND status='playing' AND payment_status='paid'",[userId]);
 const [entries]=await pool.execute(`SELECT l.id,l.source_ref AS order_no,l.amount_delta,l.source_type,UNIX_TIMESTAMP(l.created_at)*1000 AS occurred_at,
 o.project,o.detail,o.total_price,o.status,
 CASE WHEN l.entry_key=CONCAT('order:',l.source_ref,':booster_earnings') THEN 1 ELSE 0 END AS order_income,
 EXISTS(SELECT 1 FROM account_ledger r WHERE r.entry_key=CONCAT('order:',l.source_ref,':booster_earnings_test_reversal')) AS reversed
 FROM account_ledger l LEFT JOIN orders o ON o.order_no=l.source_ref AND o.booster_id=l.user_id
 WHERE ${where} ORDER BY l.created_at DESC,l.id DESC LIMIT 20 OFFSET ${(f.page-1)*20}`,params);
 return {earnings:Number(users[0].earnings),admin:users[0].role==='admin',filter:f,summary:summary[0],pending:pending[0],
 legacy_unlinked:Math.round((Number(users[0].earnings)-Number(tracked[0].net))*100)/100,entries,page:f.page,page_size:20};
}
async function earnings(pool,userId,query) {
 if(!pool.getConnection)return earningsRead(pool,userId,query);
 const conn=await pool.getConnection();
 try{await conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await conn.beginTransaction();const data=await earningsRead(conn,userId,query);await conn.commit();return data;}
 catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
const reversalKey=ref=>`order:${ref}:booster_earnings_test_reversal`;
async function preview(db,ref,legacyAmount,lock=false) {
 if(typeof ref!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(ref))fail('订单号无效');
 const [orders]=await db.execute('SELECT order_no,booster_id,status,payment_status,total_price FROM orders WHERE order_no=?'+(lock?' FOR UPDATE':''),[ref]);
 const order=orders[0];if(!order)fail('订单不存在',404);
 if(order.status!=='done'||order.payment_status!=='paid'||!order.booster_id)fail('只能核对已完成且已核实收款的接单收益',409);
 const [users]=await db.execute('SELECT id,username,earnings FROM users WHERE id=?'+(lock?' FOR UPDATE':''),[order.booster_id]);if(!users.length)fail('打手账户不存在',404);
 const [rows]=await db.execute("SELECT id,entry_key,user_id,account_type,amount_delta FROM account_ledger WHERE entry_key IN (?,?)",[`order:${ref}:booster_earnings`,reversalKey(ref)]);
 const original=rows.find(r=>r.entry_key===`order:${ref}:booster_earnings`),reversal=rows.find(r=>r.entry_key===reversalKey(ref));
 if(original&&(Number(original.user_id)!==Number(order.booster_id)||original.account_type!=='earnings'||Number(original.amount_delta)<=0))fail('原始收益流水与订单不一致，需核对',409);
 const max=cents(order.total_price*0.75);
 let amount=original?Number(original.amount_delta):null;
 if(!original&&legacyAmount!==undefined&&legacyAmount!==''){
  const entered=Number(legacyAmount);
  if(!Number.isFinite(entered)||entered<=0||Math.abs(entered*100-Math.round(entered*100))>1e-7||cents(entered)>max)fail('历史核对金额须为正数、最多两位小数，且不超过该单当前75%分成上限');
  amount=entered;
 }
 const data={order_no:ref,booster_id:order.booster_id,booster_name:users[0].username,balance:Number(users[0].earnings),amount,
 original_ledger_id:original?String(original.id):null,legacy:!original,legacy_limit:max/100,reversed:Boolean(reversal)};
 data.snapshot=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');return data;
}
async function reverseTest({pool,ref,actor,body}) {
 if(body?.confirmation!=='REVERSE_TEST_EARNINGS')fail('请明确确认测试收益冲正');
 const reason=typeof body.reason==='string'?body.reason.trim():'';
 const reference=typeof body.reference==='string'?body.reference.trim():'';
 if(reason.length<2||reason.length>250||reference.length>120)fail('请填写2–250字的测试核对说明，核对依据最多120字');
 const conn=await pool.getConnection();
 try {
  await conn.beginTransaction();const p=await preview(conn,ref,body.legacy_amount,true);
  if(p.reversed)fail('该订单测试收益已冲正，不能重复扣减',409);
  if(p.snapshot!==body.snapshot)fail('订单或余额已变化，请重新核对',409);
  if(p.amount===null)fail('历史订单没有原始流水，请先填写核实金额');
  if(p.legacy&&!reference)fail('历史无流水订单必须填写核对依据');
  if(cents(p.balance)<cents(p.amount))fail('当前收益余额不足，未执行扣减',409);
  const balance=await postAccountDelta(conn,{userId:p.booster_id,accountType:'earnings',delta:-p.amount,
   entryKey:reversalKey(ref),sourceType:p.legacy?'booster_test_legacy':'booster_test_reversal',sourceRef:ref,actorUserId:actor});
  const note=`测试收益冲正 ¥${p.amount.toFixed(2)}；${p.legacy?'历史人工核对':'原流水 #'+p.original_ledger_id}；${reason}${reference?'；依据：'+reference:''}`;
  await conn.execute("INSERT INTO order_management_events (order_type,order_ref,actor_user_id,action,note) VALUES ('boost',?,?,?,?)",[ref,actor,'booster_test_reversed',note]);
  await recordOperation(conn,{eventKey:`booster-test:${ref}`,actorUserId:actor,action:'booster_test_reversed',targetType:'order',targetRef:ref});
  await conn.commit();return {success:true,amount:p.amount,balance};
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
module.exports={filters,earnings,preview,reverseTest};
