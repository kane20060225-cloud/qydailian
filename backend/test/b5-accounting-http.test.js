'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { issueSessionToken } = require('../lib/auth-session');

process.env.JWT_SECRET = 'b5-test-only-jwt';
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 6).toString('base64');
process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'test-user';
process.env.DB_PASSWORD = 'test-password';
process.env.DB_NAME = 'test-db';
process.env.ALIPAY_ENABLED = 'false';

const state = { users: {}, orders: [], ledger: [], audit: [], purchases: [], stock: 2 };
function reset() {
  state.users = {
    3: { qy_credits: 200, total_earned_credits: 0, earnings: 0,
      booster_points: 0, booster_identity: 'standard' },
    7: { qy_credits: 0, total_earned_credits: 0, earnings: 0,
      booster_points: 0, booster_identity: 'standard' }
  };
  state.orders = [];
  state.ledger = [];
  state.audit = [];
  state.purchases = [];
  state.stock = 2;
}
const conn = {
  saved: null,
  async beginTransaction() { this.saved = structuredClone(state); },
  async commit() { this.saved = null; },
  async rollback() { if (this.saved) Object.assign(state, this.saved); this.saved = null; },
  release() {},
  async execute(sql, params) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if(q==='SELECT revision, document, updated_at FROM site_service_content WHERE id=1 FOR UPDATE')return [[{revision:1,document:{projects:[{key:'test',name:'test',enabled:true,options:[{key:'a',desc:'test',price:10,enabled:true},{key:'b',desc:'test',price:2,enabled:true}]}],activities:[]}}]];
    if (q === 'SELECT qy_credits FROM users WHERE id = ? FOR UPDATE' ||
        q === 'SELECT qy_credits FROM users WHERE id=? FOR UPDATE') {
      return [[{ qy_credits: state.users[params[0]].qy_credits }]];
    }
    if (q.startsWith('SELECT ') && q.endsWith('AS balance FROM users WHERE id = ? FOR UPDATE')) {
      const column = q.split(' ')[1];
      return [[{ balance: state.users[params[0]][column] }]];
    }
    if (q.startsWith('UPDATE users SET ') && q.endsWith('= ? WHERE id = ?')) {
      const column = q.split(' ')[3];
      state.users[params[1]][column] = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO account_ledger')) {
      state.ledger.push(params);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('INSERT INTO operation_audit')) {
      state.audit.push(params);
      return [{ affectedRows: 1 }];
    }
    if(q.startsWith('INSERT INTO user_messages') || q.startsWith('INSERT IGNORE INTO order_notifications') || q.startsWith('INSERT IGNORE INTO notification_deliveries'))return [{affectedRows:1}];
    if (q.startsWith('INSERT INTO orders')) {
      state.orders.push({ order_no: params[0], user_id: params[1],
        total_price: params[8], status: 'pending', payment_status: 'unpaid' });
      return [{ insertId: state.orders.length }];
    }
    if (q.startsWith('SELECT * FROM qy_shop_items')) {
      return [[{ id: 5, name: 'test item', price_credits: 100, stock: state.stock }]];
    }
    if (q === 'INSERT INTO qy_purchases (user_id, item_id, item_name, price_credits) VALUES (?,?,?,?)') {
      state.purchases.push(params);
      return [{ insertId: state.purchases.length }];
    }
    if (q.startsWith('UPDATE qy_shop_items SET stock')) {
      state.stock -= 1;
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('SELECT * FROM orders WHERE order_no = ? AND booster_id')) {
      return [state.orders.filter((o) => o.order_no === params[0] &&
        o.booster_id === params[1] && o.status === params[2])];
    }
    if (q === 'UPDATE orders SET status = ? WHERE order_no = ? AND status = ?') {
      const order = state.orders.find((o) => o.order_no === params[1] && o.status === params[2]);
      if (!order) return [{ affectedRows: 0 }];
      order.status = params[0];
      return [{ affectedRows: 1 }];
    }
    if (q === 'SELECT booster_identity, booster_points FROM users WHERE id = ?') {
      const user = state.users[params[0]];
      return [[{ booster_identity: user.booster_identity, booster_points: user.booster_points }]];
    }
    if (q.startsWith('UPDATE users SET total_earned_credits')) {
      state.users[params[1]].total_earned_credits += params[0];
      return [{ affectedRows: 1 }];
    }
    if (q === 'SELECT total_earned_credits FROM users WHERE id = ?') {
      return [[{ total_earned_credits: state.users[params[0]].total_earned_credits }]];
    }
    if (q.startsWith('UPDATE users SET vip_level')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected fake SQL: ${q}`);
  }
};
const fakePool = {
  getConnection: async () => conn,
  async execute(sql) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q === 'SELECT token_version FROM users WHERE id = ?') return [[{ token_version: 0 }]];
    if (q === 'SELECT role FROM users WHERE id = ?') return [[{ role: 'booster' }]];
    if (q.startsWith('INSERT INTO user_messages')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected pool SQL: ${q}`);
  }
};
const originalCreatePool = mysql.createPool;
mysql.createPool = () => fakePool;
const { app } = require('../server');
mysql.createPool = originalCreatePool;

async function serve(t) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('normal order credit debit is recorded with the order transaction', async (t) => {
  reset();
  const base = await serve(t);
  const token = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const response = await fetch(`${base}/api/orders`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'test', detail: 'A - test', quantity: 1,urgent:false,
      player_name: 'test', price: 10, total_price: 10, use_credits: 100,
      game_account: 'account', game_password: 'password' })
  });
  assert.equal(response.status, 201);
  assert.equal(state.users[3].qy_credits, 100);
  assert.equal(state.orders.length, 1);
  assert.equal(state.ledger.length, 1);
  assert.equal(state.ledger[0][2], 'qy_credits');
  assert.equal(state.ledger[0][3], -100);
  assert.equal(state.audit.length, 1);
});

test('shop purchase posts one debit and inventory change atomically', async (t) => {
  reset();
  const base = await serve(t);
  const token = issueSessionToken(3, 0, process.env.JWT_SECRET);
  const response = await fetch(`${base}/api/shop/buy/5`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 200);
  assert.equal(state.users[3].qy_credits, 100);
  assert.equal(state.stock, 1);
  assert.equal(state.purchases.length, 1);
  assert.equal(state.ledger.length, 1);
});

test('full credit boost discount reports the real zero amount and remains pending manual review',async t=>{
 reset();const base=await serve(t),token=issueSessionToken(3,0,process.env.JWT_SECRET);
 const response=await fetch(`${base}/api/orders`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({project:'test',detail:'B - test',quantity:1,urgent:false,player_name:'test',price:2,total_price:2,use_credits:200,game_account:'synthetic',game_password:'synthetic'})});
 assert.equal(response.status,201);const data=await response.json();assert.equal(data.total_price,0);assert.equal(data.credits_used,200);assert.equal(data.state,'payment_review');assert.equal(state.users[3].qy_credits,0);assert.equal(state.ledger[0][3],-200);assert.equal(state.audit.length,1);
});

test('credit discounts retain exact cents rather than losing one credit to floating point',async t=>{
 reset();state.users[3].qy_credits=30;const base=await serve(t),token=issueSessionToken(3,0,process.env.JWT_SECRET);
 const response=await fetch(base+'/api/orders',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({project:'test',detail:'B - test',quantity:1,urgent:false,player_name:'test',price:2,total_price:2,use_credits:29})});assert.equal(response.status,201);const data=await response.json();assert.equal(data.credits_used,29);assert.equal(data.total_price,1.71);assert.equal(state.users[3].qy_credits,1);assert.equal(state.ledger[0][3],-29);
});

test('stale and forged catalog quotes cannot create an order or debit credits',async t=>{
 reset();const base=await serve(t),token=issueSessionToken(3,0,process.env.JWT_SECRET);
 for(const change of [{catalog_revision:0},{price:1,total_price:1}]){const response=await fetch(base+'/api/orders',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({project_key:'test',option_key:'a',project:'test',detail:'A - test',quantity:1,urgent:false,player_type:'standard',player_name:'test',price:10,total_price:10,use_credits:100,...change})});assert.equal(response.status,409);}
 assert.equal(state.users[3].qy_credits,200);assert.equal(state.orders.length,0);assert.equal(state.ledger.length,0);assert.equal(state.audit.length,0);
});

test('paid booster completion posts earnings and rewards only once', async (t) => {
  reset();
  state.orders = [{ order_no: 'WOT-TEST', user_id: 3, booster_id: 7,
    total_price: 10, status: 'playing', payment_status: 'paid' }];
  const base = await serve(t);
  const token = issueSessionToken(7, 0, process.env.JWT_SECRET);
  const request = () => fetch(`${base}/api/booster/complete/WOT-TEST`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal((await request()).status, 200);
  assert.equal((await request()).status, 400);
  assert.equal(state.users[7].earnings, 7.5);
  assert.equal(state.users[7].booster_points, 750);
  assert.equal(state.users[3].qy_credits, 230);
  assert.equal(state.orders[0].status, 'done');
  assert.equal(state.ledger.length, 3);
});
