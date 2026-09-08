/* ============================================================
   AR-Program — طبقة ربط API والباك إند والمزامنة السحابية اللحظية (Cloud Auto-Sync Layer)
   يدعم المزامنة التلقائية اللحظية بين كافّة الأجهزة والموبايل
   ============================================================ */

const API = (function () {
    let _lastSyncTimestamp = 0;
    let _syncTimer = null;

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

    /* ---------- المزامنة السحابية اللحظية الفورية بين الأجهزة ---------- */

    let _pushQueue = [];
    let _pushTimer = null;
    let _isPushing = false;

    async function processPushQueue() {
        if (_isPushing || _pushQueue.length === 0) return;
        _isPushing = true;
        const batch = _pushQueue.splice(0, _pushQueue.length);
        try {
            const res = await fetch(`${getBaseUrl()}/sync/push`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ batch })
            });
            if (res.ok) {
                const json = await res.json();
                if (json && json.lastUpdated) {
                    _lastSyncTimestamp = json.lastUpdated;
                }
            } else {
                _pushQueue.unshift(...batch);
            }
        } catch(e) {
            _pushQueue.unshift(...batch);
        } finally {
            _isPushing = false;
            if (_pushQueue.length > 0) {
                setTimeout(processPushQueue, 80);
            }
        }
    }

    function pushItemToCloud(store, item, action = 'save') {
        _pushQueue.push({ store, item, action });
        if (_pushTimer) clearTimeout(_pushTimer);
        _pushTimer = setTimeout(processPushQueue, 40);
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
            let hasAnyLocalData = false;
            for (const s of STORES) {
                const items = await ARDB.localGetAll(s);
                if (items && items.length) {
                    fullData[s] = items;
                    hasAnyLocalData = true;
                }
            }
            if (!hasAnyLocalData) return false;

            const res = await fetch(`${getBaseUrl()}/sync/push`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ fullData })
            });
            if (res.ok) {
                const json = await res.json();
                if (json && json.lastUpdated) _lastSyncTimestamp = json.lastUpdated;
                return true;
            }
        } catch(e) {
            console.warn('[Sync] full push failed:', e);
        }
        return false;
    }

    async function pullCloudSync(force = false) {
        try {
            const res = await fetch(`${getBaseUrl()}/sync/pull`, { headers: getAuthHeaders() });
            if (res.ok) {
                const json = await res.json();
                if (json && json.lastUpdated && (force || json.lastUpdated > _lastSyncTimestamp)) {
                    _lastSyncTimestamp = json.lastUpdated;
                    const cloudData = json.data || {};
                    const cloudDeleted = json.deleted || {};

                    // أمر التصفير الشامل عند مسح الداتا بيز أونلاين
                    if (json.reset) {
                        await ARDB.clearAllData();
                        await ARDB.seed();
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('ar_cloud_data_updated', { detail: {} }));
                        }
                        return true;
                    }

                    let updatedAny = false;

                    // 1. تحديث أو إضافة العناصر الواردة من السحابة إلى IndexedDB المحلي
                    for (const s of Object.keys(cloudData)) {
                        const items = cloudData[s] || [];
                        if (!items || !items.length) continue;
                        for (const item of items) {
                            if (!item) continue;
                            try {
                                await ARDB.localPut(s, item);
                                updatedAny = true;
                            } catch(e){}
                        }
                    }

                    // 2. حذف العناصر التي تم حذفها صراحةً من السحابة في الأجهزة الأخرى
                    for (const s of Object.keys(cloudDeleted)) {
                        const deletedIds = cloudDeleted[s] || [];
                        for (const delId of deletedIds) {
                            if (delId == null) continue;
                            try {
                                const numId = Number(delId);
                                if (!isNaN(numId)) await ARDB.localRemove(s, numId);
                                await ARDB.localRemove(s, String(delId));
                                updatedAny = true;
                            } catch(e){}
                        }
                    }

                    if ((updatedAny || force) && typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('ar_cloud_data_updated', { detail: cloudData }));
                    }
                    return updatedAny;
                }
            }
        } catch(e) {}
        return false;
    }

    function startAutoSync() {
        if (_syncTimer) return;
        pullCloudSync();
        _syncTimer = setInterval(async () => {
            await pullCloudSync();
        }, 1000);

        if (typeof window !== 'undefined') {
            window.addEventListener('focus', () => pullCloudSync(true));
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) pullCloudSync(true);
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
        if (typeof item === 'object' && item !== null) {
            if (!item.id) {
                item.id = Date.now() + Math.floor(Math.random() * 10000);
            }
        }
        await ARDB.localPut(store, item);
        const finalId = (item && item.id) ? item.id : Date.now();
        pushItemToCloud(store, item, 'save');
        return finalId;
    }

    async function update(store, item) {
        if (typeof item === 'object' && item !== null && !item.id) {
            item.id = Date.now() + Math.floor(Math.random() * 10000);
        }
        await ARDB.localPut(store, item);
        pushItemToCloud(store, item, 'save');
        return item;
    }

    async function remove(store, id) {
        await ARDB.localRemove(store, id);
        pushItemToCloud(store, { id }, 'delete');
        return true;
    }

    async function resetAllData() {
        try {
            await fetch(`${getBaseUrl()}/sync/reset`, { method: 'POST', headers: getAuthHeaders() });
        } catch(e){}
        if (typeof ARDB !== 'undefined') {
            await ARDB.clearAllData();
        }
        _lastSyncTimestamp = Date.now();
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ar_cloud_data_updated', { detail: {} }));
        }
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
        resetAllData,
        getAll,
        getById,
        add,
        update,
        delete: remove
    };
})();
