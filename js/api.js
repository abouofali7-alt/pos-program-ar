/* ============================================================
   AR-Program — طبقة ربط API والباك إند (API Integration Layer)
   يدعم وضع الهجين: الاتصال بالسيرفر أو التحويل التلقائي لقاعدة البيانات المحلية (IndexedDB)
   ============================================================ */

const API = (function () {
    function getDefaultBaseUrl() {
        if (typeof window !== 'undefined' && window.location && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !window.location.protocol.startsWith('file')) {
            return window.location.origin.replace(/\/+$/, '') + '/api';
        }
        return 'http://localhost:8080/api';
    }
    
    function getBaseUrl() {
        return localStorage.getItem('ar_api_base_url') || getDefaultBaseUrl();
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
        const setting = localStorage.getItem('ar_api_mode');
        if (setting === 'true') return true;
        if (setting === 'false') return false;
        return false; // الافتراضي الاستعانة بـ IndexedDB مع المزامنة التلقائية
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

    /* ---------- العمليات الأساسية (CRUD مع الفولباك التلقائي لـ IndexedDB) ---------- */

    async function getAll(store) {
        if (isApiModeEnabled()) {
            try {
                const endpoint = storeToEndpoint(store);
                const res = await fetch(`${getBaseUrl()}/${endpoint}`, { headers: getAuthHeaders() });
                if (res.ok) {
                    const json = await res.json();
                    let list = null;
                    if (Array.isArray(json)) list = json;
                    else if (json && Array.isArray(json.data)) list = json.data;
                    
                    if (list && Array.isArray(list)) {
                        // حفظ زمني في IndexedDB
                        for (const item of list) {
                            try { await ARDB.localPut(store, item); } catch(e){}
                        }
                        return list;
                    }
                }
            } catch (e) {
                console.warn(`[API] تعذر الجلب من الباك إند لـ ${store}، التحويل إلى IndexedDB المحلي.`, e);
            }
        }
        return await ARDB.localGetAll(store);
    }

    async function getById(store, id) {
        if (isApiModeEnabled()) {
            try {
                const endpoint = storeToEndpoint(store);
                const res = await fetch(`${getBaseUrl()}/${endpoint}/${id}`, { headers: getAuthHeaders() });
                if (res.ok) {
                    const json = await res.json();
                    const item = (json && json.data !== undefined) ? json.data : json;
                    if (item) return item;
                }
            } catch (e) {
                console.warn(`[API] تعذر الجلب بالـ ID لـ ${store} #${id}`);
            }
        }
        return await ARDB.localGetById(store, id);
    }

    async function add(store, item) {
        let saved = null;
        if (isApiModeEnabled()) {
            try {
                const endpoint = storeToEndpoint(store);
                const res = await fetch(`${getBaseUrl()}/${endpoint}`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(item)
                });
                if (res.ok) {
                    const json = await res.json();
                    saved = (json && json.data !== undefined) ? json.data : json;
                }
            } catch (e) {
                console.warn(`[API] تعذر الإضافة عبر الباك إند، الحفظ في IndexedDB المحلي`, e);
            }
        }
        const localRes = await ARDB.localAdd(store, saved || item);
        return saved || localRes;
    }

    async function update(store, item) {
        let updated = null;
        if (isApiModeEnabled()) {
            try {
                const endpoint = storeToEndpoint(store);
                const res = await fetch(`${getBaseUrl()}/${endpoint}/${item.id}`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(item)
                });
                if (res.ok) {
                    const json = await res.json();
                    updated = (json && json.data !== undefined) ? json.data : json;
                }
            } catch (e) {
                console.warn(`[API] تعذر التعديل عبر الباك إند، التعديل في IndexedDB المحلي`, e);
            }
        }
        await ARDB.localPut(store, updated || item);
        return updated || item;
    }

    async function remove(store, id) {
        if (isApiModeEnabled()) {
            try {
                const endpoint = storeToEndpoint(store);
                await fetch(`${getBaseUrl()}/${endpoint}/${id}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders()
                });
            } catch (e) {
                console.warn(`[API] تعذر الحذف عبر الباك إند، الحذف من IndexedDB المحلي`, e);
            }
        }
        return await ARDB.localRemove(store, id);
    }

    return {
        getBaseUrl,
        setBaseUrl,
        isApiModeEnabled,
        setApiMode,
        checkHealth,
        getAll,
        getById,
        add,
        update,
        delete: remove
    };
})();
