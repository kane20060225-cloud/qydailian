(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.ThemePreference = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const valid = theme => theme === 'dark' || theme === 'light';
    function create(options) {
        let session;
        const read = key => options.read(key);
        const write = (key, value) => options.write(key, value);
        const identity = () => ({ token: options.token() || '', user: options.userId() || '' });
        const current = state => session === state && identity().token === state.token && identity().user === state.user;
        const pending = state => read(state.pendingKey);
        const status = (state, value) => { if (current(state)) options.onStatus?.(value); };
        async function request(state, method, theme) {
            const response = await options.fetch('/api/user/settings', {
                method, headers: { Authorization: 'Bearer ' + state.token, ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) },
                ...(method === 'PUT' ? { body: JSON.stringify({ theme }) } : {}), signal: AbortSignal.timeout(15000)
            });
            const data = await response.json();
            if (!response.ok) throw Error(data.error || '主题同步失败，请稍后重试');
            return data;
        }
        function ensureSettings(state) {
            if (state.ready) return Promise.resolve(state.settings);
            if (!state.reading) state.reading = request(state, 'GET').then(data => {
                // GET initializes the account settings row before the first PUT.
                state.ready = true; state.settings = data; return data;
            }).finally(() => { state.reading = null; });
            return state.reading;
        }
        function save(state) {
            if (state.writing) return state.writing;
            state.writing = (async () => {
                try {
                    await ensureSettings(state);
                    while (current(state) && valid(pending(state))) {
                        const theme = pending(state), version = state.version;
                        status(state, { saving: true, message: '正在同步主题到账号…' });
                        await request(state, 'PUT', theme);
                        if (!current(state)) return { saved: false };
                        write(state.cacheKey, theme);
                        if (version === state.version && pending(state) === theme) {
                            write(state.pendingKey, '');
                            status(state, { saved: true, theme, message: '主题已保存，并同步到账号。' });
                        }
                    }
                    return { saved: current(state) };
                } catch (error) {
                    status(state, { error: error.message, message: '已保留当前主题，账号同步失败。请点击“保存主题”重试。' });
                    return { saved: false, error: error.message };
                }
            })().finally(() => { state.writing = null; });
            return state.writing;
        }
        function syncSession() {
            const who = identity();
            if (session && who.token === session.token && who.user === session.user) return session.loading || Promise.resolve();
            // Older sessions without a user id get a stable key without storing a token in its name.
            const namespace = who.user || ('session-' + Array.from(who.token).reduce((key, char) => Math.imul(key ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(36));
            const state = session = { ...who, version: 0, cacheKey: 'qy.theme.account.v1.' + namespace, pendingKey: 'qy.theme.pending.v1.' + namespace };
            if (!who.token) { options.apply(valid(read('theme')) ? read('theme') : 'dark'); return Promise.resolve(); }
            const local = pending(state) || read(state.cacheKey) || read('theme');
            if (valid(local)) options.apply(local);
            const version = state.version;
            state.loading = (async () => {
                try {
                    const data = await ensureSettings(state);
                    if (!current(state)) return;
                    if (valid(pending(state))) return save(state);
                    if (version === state.version && valid(data.theme)) {
                        write(state.cacheKey, data.theme); options.apply(data.theme);
                    }
                } catch (error) {
                    if (!state.writing && valid(pending(state))) status(state, { error: error.message, message: '已保留当前主题，账号同步失败。请点击“保存主题”重试。' });
                }
            })();
            return state.loading;
        }
        function select(theme) {
            if (!valid(theme)) return Promise.resolve({ saved: false });
            syncSession();
            const state = session;
            state.version++;
            options.apply(theme);
            if (!state.token) {
                options.onStatus?.({ local: true, message: '主题已保存到此浏览器。' });
                return Promise.resolve({ saved: false, local: true });
            }
            write(state.pendingKey, theme);
            return save(state);
        }
        function retry() {
            syncSession();
            return session.token && valid(pending(session)) ? save(session) : Promise.resolve({ saved: false });
        }
        return { syncSession, select, retry };
    }
    return { create };
});
