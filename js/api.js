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
        const isLive = typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !window.location.protocol.startsWith('file');

        if (isLive) {
            const originApi = window.location.origin.replace(/\/+$/, '') + '/api';
            localStorage.setItem('ar_api_base_url', originApi);
            return originApi;
        }
        const saved = localStorage.getItem('ar_api_base_url');
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
    let _broadcastChannel = null;

    try {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            _broadcastChannel = new BroadcastChannel('ar_pos_sync');
            _broadcastChannel.onmessage = (event) => {
                if (event.data === 'sync_now') {
                    pullCloudSync(true);
                } else if (event.data === 'reset_now') {
                    _pushQueue = [];
                    pullCloudSync(true);
                }
            };
        }
    } catch(e) {}

    function notifyLocalTabs(msg = 'sync_now') {
        if (_broadcastChannel) {
            try { _broadcastChannel.postMessage(msg); } catch(e) {}
        }
    }

    async function processPushQueue() {
        if (_isPushing || _pushQueue.length === 0) return;
        _isPushing = true;
        const clientResetTs = Number(localStorage.getItem('ar_last_reset_ts') || 0);
        const batch = _pushQueue.splice(0, _pushQueue.length);
        try {
            const res = await fetch(`${getBaseUrl()}/sync/push`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ batch, clientResetTs })
            });
            if (res.ok) {
                const json = await res.json();
                if (json && json.reset) {
                    _pushQueue = [];
                    if (json.resetTimestamp) {
                        localStorage.setItem('ar_last_reset_ts', String(json.resetTimestamp));
                    }
                    pullCloudSync(true);
                    return;
                }
                if (json && json.lastUpdated) {
                    _lastSyncTimestamp = json.lastUpdated;
                }
                notifyLocalTabs();
            } else {
                _pushQueue.unshift(...batch);
            }
        } catch(e) {
            _pushQueue.unshift(...batch);
        } finally {
            _isPushing = false;
            if (_pushQueue.length > 0) {
                setTimeout(processPushQueue, 0);
            }
        }
    }

    function pushItemToCloud(store, item, action = 'save') {
        _pushQueue.push({ store, item, action });
        if (_pushTimer) clearTimeout(_pushTimer);
        _pushTimer = setTimeout(processPushQueue, 0);
        notifyLocalTabs('sync_now');
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ar_cloud_data_updated', { detail: { store, item, action } }));
        }
    }

    async function pushFullDataToCloud() {
        try {
            const clientResetTs = Number(localStorage.getItem('ar_last_reset_ts') || 0);
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
                body: JSON.stringify({ fullData, clientResetTs })
            });
            if (res.ok) {
                const json = await res.json();
                if (json && json.reset) {
                    _pushQueue = [];
                    if (json.resetTimestamp) {
                        localStorage.setItem('ar_last_reset_ts', String(json.resetTimestamp));
                    }
                    pullCloudSync(true);
                    return false;
                }
                if (json && json.lastUpdated) _lastSyncTimestamp = json.lastUpdated;
                notifyLocalTabs();
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
                const cloudResetTs = json.resetTimestamp || 0;
                const localResetTs = Number(localStorage.getItem('ar_last_reset_ts') || 0);

                if (cloudResetTs > 0 && cloudResetTs > localResetTs) {
                    _pushQueue = []; // تفريغ ركام الرفع لمنع إرسال داتا قديمة للسيرفر
                    if (_pushTimer) clearTimeout(_pushTimer);
                    localStorage.setItem('ar_last_reset_ts', String(cloudResetTs));
                    _lastSyncTimestamp = json.lastUpdated || cloudResetTs;
                    await ARDB.clearAllData();
                    await ARDB.seed();

                    const cloudData = json.data || {};
                    let updatedAny = false;
                    for (const s of Object.keys(cloudData)) {
                        const items = (cloudData[s] || []).filter(Boolean);
                        if (items.length) {
                            try {
                                await ARDB.bulkPut(s, items, true);
                                updatedAny = true;
                            } catch(e){}
                        }
                    }

                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('ar_cloud_data_updated', { detail: cloudData }));
                    }
                    return true;
                }

                if (json && json.lastUpdated && (force || json.lastUpdated > _lastSyncTimestamp)) {
                    _lastSyncTimestamp = json.lastUpdated;
                    const cloudData = json.data || {};
                    const cloudDeleted = json.deleted || {};

                    let updatedAny = false;

                    // 1. تحديث أو إضافة العناصر الواردة من السحابة إلى IndexedDB المحلي دفعة واحدة (Bulk) بدون إعادة الرفع للسحابة
                    for (const s of Object.keys(cloudData)) {
                        const items = (cloudData[s] || []).filter(Boolean);
                        if (items.length) {
                            try {
                                await ARDB.bulkPut(s, items, true);
                                updatedAny = true;
                            } catch(e){}
                        }
                    }

                    // 2. حذف العناصر التي تم حذفها صراحةً من السحابة في الأجهزة الأخرى دفعة واحدة (Bulk) بدون إعادة الرفع للسحابة
                    for (const s of Object.keys(cloudDeleted)) {
                        const deletedIds = (cloudDeleted[s] || []).filter(id => id != null);
                        if (deletedIds.length) {
                            try {
                                await ARDB.bulkRemove(s, deletedIds, true);
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
        pullCloudSync(true).then(() => {
            pushFullDataToCloud();
        });

        _syncTimer = setInterval(async () => {
            await pullCloudSync();
        }, 250);

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
        _pushQueue = []; // تفريغ كلي لصف الرفع لمنع إرسال أي داتا سابقة
        if (_pushTimer) clearTimeout(_pushTimer);
        let now = Date.now();
        try {
            const res = await fetch(`${getBaseUrl()}/sync/reset`, { method: 'POST', headers: getAuthHeaders() });
            if (res.ok) {
                const json = await res.json();
                if (json && json.resetTimestamp) now = json.resetTimestamp;
            }
        } catch(e){}
        localStorage.setItem('ar_last_reset_ts', String(now));
        if (typeof ARDB !== 'undefined') {
            await ARDB.clearAllData();
            await ARDB.seed();
        }
        _lastSyncTimestamp = now;
        notifyLocalTabs('reset_now');
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
