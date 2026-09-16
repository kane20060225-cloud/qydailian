'use strict';
// Run only from the protected /root release directory after creating manifest/archive.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=__dirname,site='/var/www/your-site',manifest=JSON.parse(fs.readFileSync(root+'/manifest.json'));
const allowed=['backend/server.js','backend/lib/service-content.js','backend/lib/login-devices.js','backend/routes/service-content.js','backend/scripts/migrate-b19-service-content.js','backend/scripts/migrate-b20-login-devices.js','public/index.html','public/script.js','public/boost-checkout.js','public/booster-availability.js','public/order-center.js','public/light-theme.css','public/theme-components.css','public/ui-foundation.css','public/dark-theme.css','public/service-content.css','public/service-content.js','public/service-defaults.js'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),normalized=b=>hash(b.toString('utf8').replace(/\r\n/g,'\n'));
const run=(name,args)=>cp.execFileSync(name,args,{stdio:['ignore','pipe','pipe'],maxBuffer:16*1024*1024});
const atomic=(name,bytes,mode=0o644)=>{assert.ok(allowed.includes(name));const target=path.join(site,name),tmp=target+'.b20.tmp';fs.writeFileSync(tmp,bytes,{mode});fs.renameSync(tmp,target);};
const waitHealthy=async port=>{for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(1000)})).status===200)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Backend health timeout');};
(async()=>{
 assert.equal(root,'/root/'+manifest.release);assert.match(manifest.commit,/^[a-f0-9]{40}$/);assert.deepEqual(manifest.files.map(f=>f.path),allowed);assert.equal(hash(fs.readFileSync(root+'/runtime.tar')),manifest.archive_sha256);
 const before={env_sha256:hash(fs.readFileSync(site+'/backend/.env')),pid:run('pm2',['pid','my-backend']).toString().trim(),git_head:run('git',['-C',site,'rev-parse','HEAD']).toString().trim(),existing:[],modes:{}};
 assert.match(before.pid,/^\d+$/);
 for(const f of manifest.files){const target=site+'/'+f.path;if(fs.existsSync(target)){assert.ok(f.baseline,'Unexpected existing file '+f.path);assert.equal(normalized(fs.readFileSync(target)),f.baseline,'Production baseline changed '+f.path);before.existing.push(f.path);before.modes[f.path]=fs.statSync(target).mode&0o777;}else assert.equal(f.baseline,null,'Missing production file '+f.path);}
 fs.mkdirSync(root+'/backup',{mode:0o700});
 run('tar',['-czf',root+'/backup/site-before.tar.gz','--exclude=./.git','--exclude=./backend/node_modules','--exclude=./node_modules','--exclude=./artifacts','-C',site,'.']);
 run('tar',['-cf',root+'/backup/runtime-before.tar','-C',site,...before.existing]);
 const sql=root+'/backup/database-before.sql',gz=sql+'.gz';let fd=fs.openSync(sql,'wx',0o600);
 try{cp.execFileSync('mysqldump',['--login-path=b4deploy','--no-tablespaces','--single-transaction','--routines','--events','--triggers','--databases','wotbqydailian'],{stdio:['ignore',fd,'pipe']});}finally{fs.closeSync(fd);}
 const inFd=fs.openSync(sql,'r'),outFd=fs.openSync(gz,'wx',0o600);try{cp.execFileSync('gzip',['-c'],{stdio:[inFd,outFd,'pipe']});}finally{fs.closeSync(inFd);fs.closeSync(outFd);}assert.ok(fs.statSync(gz).size>100);fs.unlinkSync(sql);
 for(const name of ['site-before.tar.gz','runtime-before.tar','database-before.sql.gz'])fs.chmodSync(root+'/backup/'+name,0o600);
 fs.writeFileSync(root+'/before.json',JSON.stringify(before,null,2),{mode:0o600});
 fs.mkdirSync(root+'/code',{mode:0o700});run('tar',['-xf',root+'/runtime.tar','-C',root+'/code']);
 for(const f of manifest.files){assert.equal(normalized(fs.readFileSync(root+'/code/'+f.path)),f.sha256);if(f.path.endsWith('.js'))run('node',['--check',root+'/code/'+f.path]);}
 const cfg=require(site+'/backend/node_modules/dotenv').parse(fs.readFileSync(site+'/backend/.env'));assert.equal(cfg.DB_NAME,'wotbqydailian');
 const mysql=require(site+'/backend/node_modules/mysql2/promise'),escape=require(site+'/backend/node_modules/mysql2').escape;
 const content=require(root+'/code/backend/lib/service-content'),devices=require(root+'/code/backend/lib/login-devices');
 const scratch='b20_verify_'+manifest.commit.slice(0,10);run('mysql',['--login-path=b4deploy','-e','CREATE DATABASE '+scratch+' CHARACTER SET utf8mb4']);
 try{
  const db={execute:async(sql,args=[])=>{let index=0;const query=sql.replace(/\?/g,()=>escape(args[index++]));assert.equal(index,args.length);const result=run('mysql',['--login-path=b4deploy','--database='+scratch,'--batch','--raw','-e',query]).toString().trim();if(!result)return [[]];const [header,...rows]=result.split('\n'),keys=header.split('\t');return [rows.map(row=>Object.fromEntries(row.split('\t').map((v,i)=>[keys[i],v==='NULL'?null:v])))];}};
  await db.execute('CREATE TABLE login_devices (id INT AUTO_INCREMENT PRIMARY KEY,user_id INT NOT NULL,device_info TEXT,ip_address VARCHAR(100),login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
  await db.execute("INSERT INTO login_devices (user_id,device_info,ip_address) VALUES (1,'legacy','1.1.1.1'),(1,'legacy','8.8.8.8')");
  await content.initialize(db);await content.initialize(db);await devices.initialize(db);await devices.initialize(db);
  assert.equal((await content.read(db)).projects.length,7);
  await devices.recordLogin(db,1,'synthetic-device-1234','Chrome/100.1','1.1.1.1');await devices.recordLogin(db,1,'synthetic-device-1234','Chrome/130.2','8.8.8.8');
  assert.equal(Number((await db.execute('SELECT COUNT(*) AS n FROM login_devices'))[0][0].n),3);
  const listed=await devices.listDevices(db,1,async()=> '测试地点');assert.equal(listed.find(r=>r.device_info==='Chrome/130.2').ip_address,'8.8.8.8');assert.equal(listed.length,2);
  await devices.recordLogin(db,2,'synthetic-device-1234','Chrome/130.2','1.1.1.1');assert.equal((await devices.listDevices(db,2,async()=> '测试地点')).length,1);
  console.log('Protected site/database backups and isolated MySQL migration/upsert tests passed.');
 }finally{run('mysql',['--login-path=b4deploy','-e','DROP DATABASE '+scratch]);}
 const db=await mysql.createConnection({host:cfg.DB_HOST,port:Number(cfg.DB_PORT||3306),user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:cfg.DB_NAME});
 try{await content.initialize(db);await devices.initialize(db);await content.initialize(db);await devices.initialize(db);assert.equal((await content.read(db)).projects.length,7);}finally{await db.end();}
 let changed=false,verified=false;
 try{
  changed=true;for(const f of manifest.files)atomic(f.path,fs.readFileSync(root+'/code/'+f.path),before.modes[f.path]||0o644);
  run('pm2',['restart','my-backend']);await waitHealthy(Number(cfg.PORT||3000));
  const result={commit:manifest.commit,public_files:[],isolated_mysql_verified:true,migrations:['B19','B20'],backend_restarted:true};
  for(const f of manifest.files){assert.equal(normalized(fs.readFileSync(site+'/'+f.path)),f.sha256);if(!f.path.startsWith('public/'))continue;const name=f.path.slice(7),response=await fetch('https://wotbqydailian.vip/'+(name==='index.html'?'':name)+'?verify='+manifest.commit,{signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);assert.equal(normalized(Buffer.from(await response.text())),f.sha256,'Public hash '+name);result.public_files.push(name);}
  for(const route of ['/api/user/devices','/api/admin/service-content','/api/order-center?scope=admin'])assert.equal((await fetch('https://wotbqydailian.vip'+route)).status,401);
  const response=await fetch('https://wotbqydailian.vip/api/service-content');assert.equal(response.status,200);const published=await response.json();assert.equal(published.projects.length,7);assert.equal(published.activities.length,0);assert.equal(published.catalog_revision,1);
  assert.equal(hash(fs.readFileSync(site+'/backend/.env')),before.env_sha256);assert.equal(run('git',['-C',site,'rev-parse','HEAD']).toString().trim(),before.git_head);
  result.pid=Number(run('pm2',['pid','my-backend']).toString().trim());assert.notEqual(result.pid,Number(before.pid));result.environment_unchanged=true;result.server_git_unchanged=true;result.health_status=200;result.auth_guards_verified=true;result.verified_at=new Date().toISOString();result.backups={};
  for(const name of ['site-before.tar.gz','runtime-before.tar','database-before.sql.gz'])result.backups[name]=fs.statSync(root+'/backup/'+name).size;
  try{result.ip_location_available=(await devices.createLocator()('1.1.1.1'))!=='地点暂不可用';}catch{result.ip_location_available=false;}
  fs.writeFileSync(root+'/verified.json',JSON.stringify(result,null,2),{mode:0o600});verified=true;console.log(JSON.stringify(result,null,2));
 }finally{if(changed&&!verified){fs.mkdirSync(root+'/rollback',{mode:0o700});run('tar',['-xf',root+'/backup/runtime-before.tar','-C',root+'/rollback']);for(const f of manifest.files){if(before.existing.includes(f.path))atomic(f.path,fs.readFileSync(root+'/rollback/'+f.path),before.modes[f.path]);else if(fs.existsSync(site+'/'+f.path))fs.unlinkSync(site+'/'+f.path);}run('pm2',['restart','my-backend']);await waitHealthy(Number(cfg.PORT||3000));console.error('Runtime rollback applied; additive database structures retained.');}}
})().catch(e=>{console.error('B20 deployment failed:',e.code||e.message);process.exitCode=1;});
