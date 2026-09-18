'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { create } = require('../../public/theme-preference');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(values = {}) {
    const storage = new Map(Object.entries({ theme: 'dark', ...values })), writes = [], statuses = [];
    let account = { token: 'account-a', user: '7' }, applied, remote = 'dark', fail = false, getGate, putGate;
    const options = {
        read: key => storage.get(key), write: (key, value) => storage.set(key, value),
        token: () => account.token, userId: () => account.user, apply: value => { applied = value; storage.set('theme', value); },
        onStatus: value => statuses.push(value),
        fetch: async (_url, request) => {
            if (request.method === 'GET') { const snapshot = remote; if (getGate) await getGate.promise; return { ok: true, json: async () => ({ theme: snapshot }) }; }
            const theme = JSON.parse(request.body).theme; writes.push({ theme, token: request.headers.Authorization });
            if (putGate) { const gate = putGate; putGate = null; await gate.promise; }
            if (!fail) remote = theme;
            return { ok: !fail, json: async () => fail ? { error: '无法保存' } : { success: true } };
        }
    };
    return { storage, writes, statuses, create: () => create(options), get applied() { return applied; }, get remote() { return remote; },
        account: value => { account = value; }, fail: value => { fail = value; }, remoteTheme: value => { remote = value; },
        holdGet: gate => { getGate = gate; }, holdPut: gate => { putGate = gate; } };
}
test('theme selection saves to the account and survives a fresh controller', async () => {
    const f = fixture(), controller = f.create(); await controller.syncSession(); await controller.select('light');
    assert.equal(f.remote, 'light'); assert.equal(f.storage.get('qy.theme.pending.v1.7'), '');
    await f.create().syncSession(); assert.equal(f.applied, 'light');
});
test('late account settings cannot override a newer selection', async () => {
    const f = fixture(), gate = deferred(); f.holdGet(gate);
    const controller = f.create(), load = controller.syncSession(), save = controller.select('light');
    assert.equal(f.applied, 'light'); gate.resolve(); await Promise.all([load, save]);
    assert.equal(f.applied, 'light'); assert.equal(f.remote, 'light');
});
test('rapid toggles serialize writes and persist the final choice', async () => {
    const f = fixture(), gate = deferred(), controller = f.create(); await controller.syncSession(); f.holdPut(gate);
    const save = controller.select('light'); await tick(); controller.select('dark'); controller.select('light'); controller.select('dark');
    assert.equal(f.applied, 'dark'); assert.equal(f.writes.length, 1); gate.resolve(); await save;
    assert.deepEqual(f.writes.map(write => write.theme), ['light', 'dark']); assert.equal(f.remote, 'dark');
});
test('failed synchronization retains pending theme across refresh and retries', async () => {
    const f = fixture(), controller = f.create(); await controller.syncSession(); f.fail(true);
    assert.equal((await controller.select('light')).saved, false);
    const reloaded = f.create(); await reloaded.syncSession(); assert.equal(f.applied, 'light'); assert.equal(f.remote, 'dark');
    f.fail(false); await reloaded.retry(); assert.equal(f.remote, 'light'); assert.equal(f.storage.get('qy.theme.pending.v1.7'), '');
});
test('guest theme stays local without requests that write account settings', async () => {
    const f = fixture(); f.account({ token: '', user: '' }); const controller = f.create(); await controller.select('light');
    await f.create().syncSession(); assert.equal(f.applied, 'light'); assert.equal(f.writes.length, 0);
});
test('late response from a previous account cannot override the current account', async () => {
    const f = fixture(), gate = deferred(), controller = f.create(); f.holdGet(gate); const first = controller.syncSession();
    f.account({ token: 'account-b', user: '8' }); f.remoteTheme('light'); const second = controller.syncSession(); gate.resolve();
    await Promise.all([first, second]); assert.equal(f.applied, 'light'); assert.equal(f.writes.length, 0);
});
test('failed pending theme for another account is never written to the current account', async () => {
    const f = fixture({ 'qy.theme.pending.v1.7': 'light' }); f.account({ token: 'account-b', user: '8' });
    const controller = f.create(); await controller.syncSession(); assert.equal(f.applied, 'dark'); assert.equal(f.writes.length, 0);
    assert.equal(f.storage.get('qy.theme.pending.v1.7'), 'light');
});
