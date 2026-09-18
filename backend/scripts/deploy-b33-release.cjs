'use strict';
// Run from the protected server release directory after uploading its manifest/archive.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = __dirname, site = '/var/www/your-site', origin = 'https://wotbqydailian.vip';
const tankIds = [1,17,33,49,113,257,289,321,337,353,385,513,529,593,625,641,769,785,801,817,849,865,881,897,1025,1041,1057,1073,1089,1105,1121,1137,1153,1297,1313,1361,1377,1393,1409,1537,1553,1569,1585,1601,1617,1633,1649,1665,1809,1825,1841,1857,1889,1905,1921,2049,2065,2097,2129,2145,2161,2177,2305,2321,2353,2369,2385,2401,2433,2561,2577,2593,2609,2625,2657,2689,2817,2849,2865,2881,2897,2913,2945,3073,3105,3121,3137,3153,3201,3345,3361,3377,3425,3457,3585,3601,3633,3649,3681,3697,3713,3857,3873,3889,3905,3921,3937,3953,3969,4113,4145,4193,4225,4353,4369,4385,4401,4417,4433,4449,4465,4481,4609,4657,4689,4705,4721,4737,4881,4897,4913,4929,4945,4961,4977,4993,5121,5137,5153,5169,5185,5201,5217,5233,5249,5377,5393,5409,5425,5441,5457,5473,5489,5505,5665,5681,5713,5729,5745,5761,5889,5921,5937,5953,5969,5985,6001,6017,6145,6161,6177,6193,6209,6225,6241,6257,6273,6401,6417,6433,6449,6465,6481,6497,6529,6657,6673,6705,6721,6753,6785,6913,6929,6945,6961,6977,6993,7009,7025,7041,7169,7185,7201,7217,7249,7265,7281,7297,7425,7441,7473,7505,7521,7537,7553,7697,7713,7729,7745,7761,7777,7793,7809,7937,7953,7985,8001,8017,8033,8049,8065,8193,8209,8225,8241,8257,8273,8289,8305,8321,8465,8497,8513,8529,8561,8577,8737,8753,8785,8801,8817,8833,8961,8993,9009,9041,9057,9073,9089,9217,9249,9297,9313,9329,9345,9489,9505,9521,9553,9569,9601,9745,9761,9777,9793,9809,9825,9841,9857,9985,10001,10017,10033,10049,10065,10081,10097,10113,10241,10257,10273,10289,10337,10353,10369,10497,10513,10529,10545,10609,10625,10753,10769,10785,10801,10817,10865,10881,11009,11025,11041,11057,11073,11121,11137,11265,11281,11297,11313,11377,11393,11521,11537,11553,11569,11585,11633,11649,11777,11793,11809,11825,11889,11905,12033,12049,12065,12081,12097,12145,12161,12305,12321,12337,12417,12545,12593,12657,12673,12849,12913,12929,13073,13089,13105,13169,13185,13329,13345,13425,13441,13569,13617,13681,13697,13825,13841,13857,13873,13889,13937,13953,14097,14113,14129,14145,14193,14209,14337,14385,14449,14465,14609,14625,14705,14721,14865,14881,14961,14977,15137,15217,15233,15393,15441,15473,15489,15617,15649,15697,15729,15745,15889,15905,15937,15953,15985,16001,16145,16193,16241,16257,16401,16449,16497,16513,16641,16657,16673,16705,16753,16769,16897,17009,17025,17169,17217,17233,17265,17281,17425,17473,17489,17521,17537,17729,17745,17777,17793,17953,17985,18001,18033,18049,18177,18209,18241,18257,18289,18305,18433,18449,18497,18513,18545,18561,18689,18753,18769,18801,18817,18945,18961,18977,19009,19025,19057,19073,19217,19233,19265,19281,19313,19329,19473,19489,19521,19537,19569,19585,19713,19729,19745,19777,19793,19825,19841,19969,19985,20001,20033,20049,20081,20097,20257,20289,20305,20337,20481,20497,20513,20545,20561,20593,20737,20753,20769,20801,20817,20849,20993,21009,21025,21057,21073,21105,21249,21265,21281,21313,21329,21361,21505,21521,21569,21585,21617,21761,21777,21793,21825,21841,21889,22033,22049,22081,22097,22145,22273,22305,22337,22353,22385,22401,22529,22545,22561,22609,22641,22657,22785,22801,22817,22849,22865,23041,23057,23073,23121,23297,23313,23329,23377,23553,23569,23585,23633,23809,23825,23841,23889,24065,24081,24097,24145,24177,24321,24337,24401,24577,24593,24609,24657,24689,24849,24865,24913,25089,25105,25121,25169,25345,25361,25377,25601,25617,25633,25857,25873,25889,25937,26113,26129,26145,26369,26385,26401,26625,26641,26657,26881,26897,26913,27137,27153,27169,27393,27409,27425,27665,27681,27921,27937,28177,28193,28417,28433,28449,28673,28689,28705,28945,28961,29201,29217,29457,29473,29713,29985,30481,51201,51457,51473,51489,51713,51729,51745,51809,51985,52065,52225,52241,52257,52481,52497,52513,52561,52737,52769,52993,53025,53249,53505,53537,53585,53761,53841,54097,54273,54289,54353,54529,54545,54785,54801,54865,55057,55073,55297,55313,55889,56097,56577,56609,57105,57361,57617,58641,58881,59137,59649,59665,59905,60161,60177,60417,60929,62737,62977,62993,63553,63585,63601,63841,64001,64017,64065,64257,64273,64337,64529,64561,64593,64769,64801,64849,65329,65377];
const allowed = ["public/index.html","public/script.js","public/game-tools.css","public/game-tools.js","public/tank-catalog.js","public/images/tank-silhouette.svg"].concat(tankIds.map(id => 'public/images/tanks/' + id + '.webp'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const contentHash = (name, bytes) => hash(/\.(png|ico|webp)$/.test(name) ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
const run = (name, args) => cp.execFileSync(name, args, {stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024});
const get = route => fetch(origin + route, {signal: AbortSignal.timeout(15000), redirect: 'error'});
function atomic(name, bytes, mode) {
  assert.ok(allowed.includes(name));
  const target = path.join(site, name), temporary = target + '.b33.tmp';
  fs.mkdirSync(path.dirname(target), {recursive: true, mode: 0o755});
  fs.writeFileSync(temporary, bytes, {mode}); fs.chmodSync(temporary, mode); fs.renameSync(temporary, target);
}
(async () => {
  const manifest = JSON.parse(fs.readFileSync(root + '/manifest.json'));
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  assert.equal(root, '/root/b33-game-tools-release-' + manifest.commit.slice(0, 10));
  assert.deepEqual(manifest.files.map(file => file.path), allowed);
  assert.equal(hash(fs.readFileSync(root + '/runtime.tar')), manifest.archive_sha256);
  const before = {
    env_sha256: hash(fs.readFileSync(site + '/backend/.env')),
    pid: run('pm2', ['pid', 'my-backend']).toString().trim(),
    git_head: run('git', ['-C', site, 'rev-parse', 'HEAD']).toString().trim(),
    existing: [], modes: {}
  };
  assert.match(before.pid, /^\d+$/);
  assert.equal((await get('/api/health')).status, 200);
  for (const file of manifest.files) {
    const target = site + '/' + file.path;
    if (fs.existsSync(target)) {
      assert.ok(file.baseline, 'Unexpected existing file: ' + file.path);
      assert.equal(contentHash(file.path, fs.readFileSync(target)), file.baseline, 'Production baseline changed: ' + file.path);
      before.existing.push(file.path); before.modes[file.path] = fs.statSync(target).mode & 0o777;
    } else assert.equal(file.baseline, null, 'Missing production file: ' + file.path);
  }
  fs.mkdirSync(root + '/backup', {mode: 0o700});
  run('tar', ['-czf', root + '/backup/public-before.tar.gz', '-C', site, 'public']);
  run('tar', ['-cf', root + '/backup/runtime-before.tar', '-C', site, ...before.existing]);
  for (const name of ['public-before.tar.gz', 'runtime-before.tar']) fs.chmodSync(root + '/backup/' + name, 0o600);
  fs.writeFileSync(root + '/before.json', JSON.stringify(before, null, 2), {mode: 0o600});
  fs.mkdirSync(root + '/code', {mode: 0o700});
  assert.deepEqual(run('tar', ['-tf', root + '/runtime.tar']).toString().trim().split('\n').filter(name => !name.endsWith('/')).sort(), [...allowed].sort());
  run('tar', ['-xf', root + '/runtime.tar', '-C', root + '/code']);
  for (const file of manifest.files) assert.equal(contentHash(file.path, fs.readFileSync(root + '/code/' + file.path)), file.sha256);
  // Publish assets first so the new document never references missing files.
  const publishOrder = [...manifest.files.filter(file => file.path !== 'public/index.html'), manifest.files[0]];
  let changed = false, verified = false;
  try {
    changed = true;
    for (const file of publishOrder) atomic(file.path, fs.readFileSync(root + '/code/' + file.path), before.modes[file.path] || 0o644);
    const result = {commit: manifest.commit, public_files: [], backend_restarted: false, database_migrations: [], backups: {}};
    for (let i = 0; i < manifest.files.length; i += 8) await Promise.all(manifest.files.slice(i, i + 8).map(async file => {
      assert.equal(contentHash(file.path, fs.readFileSync(site + '/' + file.path)), file.sha256);
      const name = file.path.slice(7), response = await get('/' + (name === 'index.html' ? '' : name) + '?verify=' + manifest.commit);
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(contentHash(file.path, bytes), file.sha256, 'Public content differs: ' + name);
      result.public_files.push(name);
    }));
    assert.equal((await get('/api/health')).status, 200);
    assert.equal((await get('/api/order-center?scope=admin')).status, 401);
    assert.equal(hash(fs.readFileSync(site + '/backend/.env')), before.env_sha256);
    assert.equal(run('git', ['-C', site, 'rev-parse', 'HEAD']).toString().trim(), before.git_head);
    assert.equal(run('pm2', ['pid', 'my-backend']).toString().trim(), before.pid);
    result.pid = Number(before.pid); result.environment_unchanged = true; result.server_git_unchanged = true;
    result.health_status = 200; result.auth_guard_verified = true; result.verified_at = new Date().toISOString();
    for (const name of ['public-before.tar.gz', 'runtime-before.tar']) result.backups[name] = fs.statSync(root + '/backup/' + name).size;
    fs.writeFileSync(root + '/verified.json', JSON.stringify(result, null, 2), {mode: 0o600});
    verified = true; console.log(JSON.stringify({...result, public_files: result.public_files.length}, null, 2));
  } finally {
    if (changed && !verified) {
      fs.mkdirSync(root + '/rollback', {mode: 0o700}); run('tar', ['-xf', root + '/backup/runtime-before.tar', '-C', root + '/rollback']);
      for (const file of [...publishOrder].reverse()) {
        if (before.existing.includes(file.path)) atomic(file.path, fs.readFileSync(root + '/rollback/' + file.path), before.modes[file.path]);
        else if (fs.existsSync(site + '/' + file.path)) fs.unlinkSync(site + '/' + file.path);
      }
      assert.equal((await get('/api/health')).status, 200); console.error('B33 front-end rollback completed.');
    }
  }
})().catch(error => { console.error('B33 deployment failed:', error.code || error.message); process.exitCode = 1; });
