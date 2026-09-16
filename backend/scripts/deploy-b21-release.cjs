'use strict';
// Execute only in the protected server release directory with its manifest/archive.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=__dirname,site='/var/www/your-site',origin='https://wotbqydailian.vip';
const allowed=['backend/lib/login-devices.js','public/index.html','public/script.js','public/service-content.js','public/service-content.css'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),normalized=bytes=>hash(bytes.toString('utf8').replace(/\r\n/g,'\n'));
const run=(name,args)=>cp.execFileSync(name,args,{stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024});
const get=async route=>fetch(origin+route,{signal:AbortSignal.timeout(15000),redirect:'error'});
async function healthy(port){for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(1000)})).status===200)return;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}throw Error('Backend health timeout');}
function atomic(name,bytes,mode){assert.ok(allowed.includes(name));const target=path.join(site,name),temporary=target+'.b21.tmp';fs.writeFileSync(temporary,bytes,{mode});fs.chmodSync(temporary,mode);fs.renameSync(temporary,target);}
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(root+'/manifest.json'));
 assert.match(manifest.commit,/^[a-f0-9]{40}$/);assert.equal(root,'/root/b21-devices-activities-release-'+manifest.commit.slice(0,10));
 assert.deepEqual(manifest.files.map(file=>file.path),allowed);assert.equal(hash(fs.readFileSync(root+'/runtime.tar')),manifest.archive_sha256);
 const before={env_sha256:hash(fs.readFileSync(site+'/backend/.env')),pid:run('pm2',['pid','my-backend']).toString().trim(),git_head:run('git',['-C',site,'rev-parse','HEAD']).toString().trim(),modes:{}};
 assert.match(before.pid,/^\d+$/);
 for(const file of manifest.files){const target=site+'/'+file.path;assert.equal(normalized(fs.readFileSync(target)),file.baseline,'Production baseline changed: '+file.path);before.modes[file.path]=fs.statSync(target).mode&0o777;}
 const cfg=require(site+'/backend/node_modules/dotenv').parse(fs.readFileSync(site+'/backend/.env'));assert.equal(cfg.DB_NAME,'wotbqydailian');
 const db=await require(site+'/backend/node_modules/mysql2/promise').createConnection({host:cfg.DB_HOST,port:Number(cfg.DB_PORT||3306),user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:cfg.DB_NAME});
 try{
  const [columns]=await db.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='login_devices' AND COLUMN_NAME='device_key'");assert.equal(columns.length,1,'B20 device schema missing');
  const [indexes]=await db.execute("SELECT COLUMN_NAME,NON_UNIQUE FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='login_devices' AND INDEX_NAME='uq_login_device' ORDER BY SEQ_IN_INDEX");assert.deepEqual(indexes.map(row=>row.COLUMN_NAME),['user_id','device_key']);assert.ok(indexes.every(row=>Number(row.NON_UNIQUE)===0));
 }finally{await db.end();}
 fs.mkdirSync(root+'/backup',{mode:0o700});
 run('tar',['-czf',root+'/backup/site-before.tar.gz','--exclude=./.git','--exclude=./backend/node_modules','--exclude=./node_modules','--exclude=./artifacts','-C',site,'.']);
 run('tar',['-cf',root+'/backup/runtime-before.tar','-C',site,...allowed]);
 for(const name of ['site-before.tar.gz','runtime-before.tar'])fs.chmodSync(root+'/backup/'+name,0o600);
 fs.writeFileSync(root+'/before.json',JSON.stringify(before,null,2),{mode:0o600});
 fs.mkdirSync(root+'/code',{mode:0o700});run('tar',['-xf',root+'/runtime.tar','-C',root+'/code']);
 for(const file of manifest.files){assert.equal(normalized(fs.readFileSync(root+'/code/'+file.path)),file.sha256);if(file.path.endsWith('.js'))run('node',['--check',root+'/code/'+file.path]);}
 const checkDb=await require(site+'/backend/node_modules/mysql2/promise').createConnection({host:cfg.DB_HOST,port:Number(cfg.DB_PORT||3306),user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:cfg.DB_NAME});
 try{await require(root+'/code/backend/lib/login-devices').listDevices(checkDb,0,async()=> '验证');}finally{await checkDb.end();}
 let changed=false,verified=false;
 try{
  changed=true;for(const file of manifest.files)atomic(file.path,fs.readFileSync(root+'/code/'+file.path),before.modes[file.path]);
  run('pm2',['restart','my-backend']);await healthy(Number(cfg.PORT||3000));
  const result={commit:manifest.commit,public_files:[],schema_verified:true,database_migrations:[],backend_restarted:true,backups:{}};
  for(const file of manifest.files){assert.equal(normalized(fs.readFileSync(site+'/'+file.path)),file.sha256);if(!file.path.startsWith('public/'))continue;const name=file.path.slice(7),response=await get('/'+(name==='index.html'?'':name)+'?verify='+manifest.commit);assert.equal(response.status,200);assert.equal(normalized(Buffer.from(await response.text())),file.sha256,'Public content differs: '+name);result.public_files.push(name);}
  assert.equal((await get('/api/health')).status,200);
  for(const route of ['/api/user/devices','/api/admin/service-content','/api/order-center?scope=admin'])assert.equal((await get(route)).status,401);
  const response=await get('/api/service-content');assert.equal(response.status,200);const catalog=await response.json();assert.ok(Array.isArray(catalog.projects)&&catalog.projects.length>0);assert.ok(Array.isArray(catalog.activities));
  assert.equal(hash(fs.readFileSync(site+'/backend/.env')),before.env_sha256);assert.equal(run('git',['-C',site,'rev-parse','HEAD']).toString().trim(),before.git_head);
  result.pid=Number(run('pm2',['pid','my-backend']).toString().trim());assert.ok(result.pid>0);assert.notEqual(result.pid,Number(before.pid));
  result.environment_unchanged=true;result.server_git_unchanged=true;result.health_status=200;result.auth_guards_verified=true;result.verified_at=new Date().toISOString();
  for(const name of ['site-before.tar.gz','runtime-before.tar'])result.backups[name]=fs.statSync(root+'/backup/'+name).size;
  fs.writeFileSync(root+'/verified.json',JSON.stringify(result,null,2),{mode:0o600});verified=true;console.log(JSON.stringify(result,null,2));
 }finally{
  if(changed&&!verified){fs.mkdirSync(root+'/rollback',{mode:0o700});run('tar',['-xf',root+'/backup/runtime-before.tar','-C',root+'/rollback']);for(const file of manifest.files)atomic(file.path,fs.readFileSync(root+'/rollback/'+file.path),before.modes[file.path]);run('pm2',['restart','my-backend']);await healthy(Number(cfg.PORT||3000));console.error('B21 runtime rollback completed.');}
 }
})().catch(error=>{console.error('B21 deployment failed:',error.code||error.message);process.exitCode=1;});
