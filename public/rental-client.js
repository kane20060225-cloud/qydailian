(function (root) {
    'use strict';

    const accountStatusLabels = Object.freeze({
        pending: '待审核', active: '已上架', suspended: '已下架/未通过'
    });

    function screenshotNames(raw) {
        let names = raw;
        if (typeof names === 'string') {
            try { names = JSON.parse(names); } catch { return []; }
        }
        return Array.isArray(names) ? names.filter(name =>
            typeof name === 'string' && /^rental_\d+_\d+\.(?:png|jpe?g)$/.test(name)).slice(0, 3) : [];
    }

    function createRentalClient({ fetchImpl, getToken, now = Date.now, ttlMs = 5000 } = {}) {
        const fetcher = fetchImpl || root.fetch?.bind(root);
        if (!fetcher) throw new Error('fetch is unavailable');
        const tokenProvider = getToken || (() => {
            try { return root.localStorage?.getItem('token'); } catch { return null; }
        });
        let hallData = null;
        let hallExpiresAt = 0;
        let hallPending = null;
        let cacheEpoch = 0;

        async function requestJson(path, { method = 'GET', auth = false, body } = {}) {
            const headers = {};
            if (auth) {
                const token = tokenProvider();
                if (!token) throw new Error('请先登录');
                headers.Authorization = `Bearer ${token}`;
            }
            if (body !== undefined) headers['Content-Type'] = 'application/json';
            const response = await fetcher(`/api${path}`, {
                method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {})
            });
            let data;
            try { data = await response.json(); } catch { throw new Error('服务器响应格式错误'); }
            if (!response.ok) throw new Error(data?.error || '请求失败');
            return { data, headers: response.headers };
        }

        function invalidateHall() {
            cacheEpoch++;
            hallData = null;
            hallExpiresAt = 0;
            hallPending = null;
        }

        async function getHall({ force = false } = {}) {
            if (force) invalidateHall();
            if (!force && hallData && now() < hallExpiresAt) return hallData;
            if (!force && hallPending) return hallPending;
            const epoch = cacheEpoch;
            const pending = requestJson('/rental/accounts').then(({ data }) => {
                if (!Array.isArray(data)) throw new Error('租号列表响应无效');
                if (cacheEpoch === epoch) {
                    hallData = data;
                    hallExpiresAt = now() + ttlMs;
                }
                return data;
            }).finally(() => {
                if (hallPending === pending) hallPending = null;
            });
            hallPending = pending;
            return pending;
        }

        function checkedId(id) {
            const number = Number(id);
            if (!Number.isSafeInteger(number) || number <= 0) throw new Error('出租账号 ID 无效');
            return number;
        }

        async function getAccount(id) {
            return (await requestJson(`/rental/accounts/${checkedId(id)}`)).data;
        }

        async function getMyAccounts() {
            const { data } = await requestJson('/rental/my-accounts', { auth: true });
            if (!Array.isArray(data)) throw new Error('出租账号列表响应无效');
            return data;
        }

        async function getAdminAccounts({ status = '', page = 1 } = {}) {
            if (status && !['pending', 'active', 'suspended'].includes(status)) {
                throw new Error('筛选状态无效');
            }
            if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
                throw new Error('页码无效');
            }
            const params = new URLSearchParams({ page: String(page) });
            if (status) params.set('status', status);
            const { data, headers } = await requestJson(`/admin/rental/accounts?${params}`, { auth: true });
            if (!Array.isArray(data)) throw new Error('审核列表响应无效');
            return { accounts: data, total: Number(headers?.get('X-Total-Count')) || 0 };
        }

        async function reviewAccount(id, approved) {
            if (typeof approved !== 'boolean') throw new Error('审核参数无效');
            const { data } = await requestJson(`/admin/rental/accounts/${checkedId(id)}/review`,
                { method: 'PUT', auth: true, body: { approved } });
            invalidateHall();
            return data;
        }

        async function uploadScreenshot(file) {
            const type = String(file?.type || '').toLowerCase();
            if (!['image/png', 'image/jpeg'].includes(type)) {
                throw new Error('只接受 PNG 或 JPEG 图片');
            }
            if (!Number.isFinite(file.size) || file.size < 8 || file.size > 5 * 1024 * 1024) {
                throw new Error('截图大小须在 8 字节到 5MB 之间');
            }
            const token = tokenProvider();
            if (!token) throw new Error('请先登录');
            const response = await fetcher('/api/rental/upload-screenshot', {
                method: 'POST', headers: { Authorization: `Bearer ${token}`,
                    'Content-Type': type }, body: file
            });
            let data;
            try { data = await response.json(); } catch { throw new Error('服务器响应格式错误'); }
            if (!response.ok) throw new Error(data?.error || '上传失败');
            if (typeof data?.filename !== 'string') throw new Error('上传响应无效');
            return data.filename;
        }

        async function changeAccountStatus(id, status) {
            if (!['pending', 'suspended'].includes(status)) throw new Error('账号状态无效');
            const { data } = await requestJson(`/rental/accounts/${checkedId(id)}/status`,
                { method: 'PUT', auth: true, body: { status } });
            invalidateHall();
            return data;
        }

        return { requestJson, getHall, getAccount, getMyAccounts, getAdminAccounts,
            reviewAccount, uploadScreenshot, changeAccountStatus, invalidateHall };
    }

    root.RentalClient = { createRentalClient, screenshotNames, accountStatusLabels };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = root.RentalClient;
    }
})(typeof window !== 'undefined' ? window : globalThis);
