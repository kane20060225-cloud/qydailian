'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const mysql=require('mysql2/promise');
Object.assign(process.env,{JWT_SECRET:'retired-feature-test-jwt',DATA_ENCRYPTION_KEY:Buffer.alloc(32,10).toString('base64'),DB_HOST:'127.0.0.1',DB_USER:'test',DB_PASSWORD:'test',DB_NAME:'test',ALIPAY_ENABLED:'false'});
let queries=0;
const original=mysql.createPool;mysql.createPool=()=>({execute:async(sql)=>{queries++;if(sql.startsWith('SELECT * FROM game_news')||sql.startsWith('SELECT * FROM announcements'))return [[]];throw Error('Unexpected DB access');}});const {app}=require('../server');mysql.createPool=original;
test('all retired league and team routes return 404 without reaching auth or database',async t=>{
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}`;
  for(const [method,route]of [['GET','/api/admin/leagues'],['POST','/api/admin/leagues'],['DELETE','/api/admin/leagues/1'],['GET','/api/admin/leagues/1/rules'],['POST','/api/admin/leagues/1/rules'],['GET','/api/admin/leagues/1/scores/1/1'],['POST','/api/admin/leagues/1/scores'],['GET','/api/admin/teams'],['POST','/api/admin/teams'],['DELETE','/api/admin/teams/1'],['GET','/api/league/1/rankings'],['GET','/api/league-news'],['GET','/api/admin/league-news'],['POST','/api/admin/league-news'],['DELETE','/api/admin/league-news/1']])assert.equal((await fetch(base+route,{method})).status,404,method+' '+route);
  assert.equal(queries,0);assert.equal((await fetch(base+'/api/game-news')).status,200);assert.equal((await fetch(base+'/api/announcements')).status,200);assert.equal((await fetch(base+'/api/health')).status,200);assert.equal((await fetch(base+'/api/order-center')).status,401);
});
