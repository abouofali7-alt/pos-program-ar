/* ============================================================
   AR-Program — طبقة ربط API والباك إند والمزامنة السحابية اللحظية (Cloud Auto-Sync Layer)
   يدعم المزامنة التلقائية اللحظية بين كافّة الأجهزة والموبايل
   ============================================================ */

const API = (function () {
    let _lastSyncTimestamp = 0;
    let _syncTimer = null;

    const REMOTE_SYNC_BIN = 'https://extendsclass.com/api/json-storage/bin/acacfac';

    function getDefaultBaseUrl() {
        if (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !window.location.protocol.startsWith('file')) {
            return window.location.origin.replace(/\/+$/, '') + '/api';
        }
        return 'http://localhost:8080/api';
    }
    
    function getBaseUrl() {
        const saved = localStorage.getItem('ar_api_base_url');
        const isLive = typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !window.location.protocol.startsWith('file');

        if (isLive) {
            if (!saved || saved.includes('localhost') || saved.includes('127.0.0.1')) {
                const originApi = window.location.origin.replace(/\/+$/, '') + '/api';
                localStorage.setItem('ar_api_base_url', originApi);
                return originApi;
            }
        }
        return saved || getDefaultBaseUrl();
    }

    function setBaseUrl(url) {
        let cleanUrl = url.trim().replace(/\/+$/, '');
        if (!cleanUrl.endsWith('/api') && !cleanUrl.includes('/api/')) {
            cleanUrl += '/api';
        }
        localStorage.setItem('ar_api_base_url', cleanUrl);
    }

    function getAuthHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        try {
            const sess = JSON.parse(localStorage.getItem('ar_session') || 'null');
            if (sess && sess.token) {
                headers['Authorization'] = 'Bearer ' + sess.token;
            }
        } catch(e) {}
        return headers;
    }

    function isApiModeEnabled() {
        return true;
    }

    function setApiMode(enabled) {
        localStorage.setItem('ar_api_mode', enabled ? 'true' : 'false');
    }

    async function checkHealth() {
        const baseUrl = getBaseUrl();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                return { status: 'online', mode: 'api', url: baseUrl };
            }
        } catch (e) {}
        return { status: 'offline', mode: 'local', url: baseUrl };
    }

    function storeToEndpoint(store) {
        const map = {
            settings: 'settings',
            sequences: 'sequences',
            roles: 'roles',
            users: 'users',
            departments: 'departments',
            employees: 'employees',
            attendance: 'attendance',
            payroll: 'payroll',
            leaveRequests: 'leave-requests',
            customers: 'customers',
            suppliers: 'suppliers',
            categories: 'categories',
            products: 'products',
            serials: 'serials',
            warehouses: 'warehouses',
            stockMovements: 'stock-movements',
            invoices: 'invoices',
            invoiceReturns: 'invoice-returns',
            purchases: 'purchases',
            purchaseReturns: 'purchase-returns',
            payments: 'payments',
            expenses: 'expenses',
            quotations: 'quotations',
            offers: 'offers',
            accounts: 'accounts',
            journalEntries: 'journal-entries',
            projects: 'projects',
            tasks: 'tasks'
        };
        return map[store] || store;
    }

    /* ---------- المزامنة السحابية اللحظية الفورية بين الأجهزة ---------- */

    let _debouncePushTimer = null;
    function scheduleDebouncedFullPush() {
        if (_debouncePushTimer) clearTimeout(_debouncePushTimer);
        _debouncePushTimer = setTimeout(() => {
            pushFullDataToCloud();
        }, 400);
    }

    async function pushItemToCloud(store, item, action = 'save') {
        try {
            await fetch(`${getBaseUrl()}/sync/push`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ store, item, action })
            });
        } catch(e) {
            console.warn('[Sync] push item failed:', e);
        }
    }

    async function pushFullDataToCloud() {
        try {
            const STORES = [
                'settings','sequences','roles','users','departments','employees','attendance','payroll','leaveRequests',
                'customers','suppliers','categories','products','serials','warehouses','stockMovements',
                'invoices','invoiceReturns','purchases','purchaseReturns','payments','expenses','quotations','offers',
                'accounts','journalEntries','projects','tasks'
            ];
            const fullData = {};
            for (const s of STORES) {
                fullData[s] = await ARDB.localGetAll(s);
            }
            const cloudPayload = { lastUpdated: Date.now(), data: fullData };
            
            // الرفع المزدوج: لسيرفر Vercel وسيرفر التخزين السحابي الدائم
            fetch(`${getBaseUrl()}/sync/push`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ fullData })
            }).catch(() => {});

            const resDirect = await fetch(REMOTE_SYNC_BIN, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cloudPayload)
            });
            if (resDirect.ok) {
                _lastSyncTimestamp = cloudPayload.lastUpdated;
                return true;
            }
        } catch(e) {
            console.warn('[Sync] full push failed:', e);
        }
        return false;
    }

    async function pullCloudSync() {
        try {
            let json = null;
            try {
                const res = await fetch(`${getBaseUrl()}/sync/pull`, { headers: getAuthHeaders() });
                if (res.ok) json = await res.json();
            } catch(e) {}

            if (!json || !json.data || !Object.keys(json.data).length) {
                const resDirect = await fetch(REMOTE_SYNC_BIN);
                if (resDirect.ok) json = await resDirect.json();
            }

            if (json && json.lastUpdated && json.lastUpdated > _lastSyncTimestamp) {
                _lastSyncTimestamp = json.lastUpdated;
                const cloudData = json.data || {};
                let updatedAny = false;
                for (const s of Object.keys(cloudData)) {
                    const items = cloudData[s] || [];
                    for (const item of items) {
                        try {
                            await ARDB.localPut(s, item);
                            updatedAny = true;
                        } catch(e){}
                    }
                }
                if (updatedAny && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('ar_cloud_data_updated', { detail: cloudData }));
                }
                return updatedAny;
            }
        } catch(e) {}
        return false;
    }

    function startAutoSync() {
        if (_syncTimer) return;
        pullCloudSync();
        _syncTimer = setInterval(async () => {
            await pullCloudSync();
        }, 1500);

        if (typeof window !== 'undefined') {
            window.addEventListener('focus', () => pullCloudSync());
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) pullCloudSync();
            });
        }
    }

    /* ---------- العمليات المزدوجة (حفظ محلي + مزامنة سحابية) ---------- */

    async function getAll(store) {
        return await ARDB.localGetAll(store);
    }

    async function getById(store, id) {
        return await ARDB.localGetById(store, id);
    }

    async function add(store, item) {
        const localRes = await ARDB.localAdd(store, item);
        const finalId = (typeof localRes === 'number' || typeof localRes === 'string') ? localRes : (item.id || Date.now());
        const finalItem = Object.assign({}, item, { id: finalId });
        pushItemToCloud(store, finalItem, 'save');
        scheduleDebouncedFullPush();
        return localRes;
    }

    async function update(store, item) {
        await ARDB.localPut(store, item);
        pushItemToCloud(store, item, 'save');
        scheduleDebouncedFullPush();
        return item;
    }

    async function remove(store, id) {
        await ARDB.localRemove(store, id);
        pushItemToCloud(store, { id }, 'delete');
        scheduleDebouncedFullPush();
        return true;
    }

    return {
        getBaseUrl,
        setBaseUrl,
        isApiModeEnabled,
        setApiMode,
        checkHealth,
        pushItemToCloud,
        pushFullDataToCloud,
        pullCloudSync,
        startAutoSync,
        getAll,
        getById,
        add,
        update,
        delete: remove
    };
})();
