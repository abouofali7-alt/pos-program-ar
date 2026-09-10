/* ============================================================
   AR-Program — طبقة البيانات (IndexedDB) — نظام متكامل
   المحاسبة · المخزون · الموارد البشرية · إدارة الأعمال
   ============================================================ */

const ARDB = (function () {
    const DB_NAME = 'ar_program_erp';
    const DB_VERSION = 2;

    let _db = null;

    /* ---------- مخطط قاعدة البيانات ---------- */
    function schemaFor(store) {
        switch (store) {
            case 'settings': return { key: 'key' };
            case 'sequences': return { key: 'name' };
            case 'roles': return { key: 'id', auto: true };
            case 'users': return { key: 'id', auto: true, idx: [{ name: 'username', key: 'username', unique: true }] };
            case 'departments': return { key: 'id', auto: true };
            case 'employees': return { key: 'id', auto: true, idx: [{ name: 'departmentId', key: 'departmentId' }] };
            case 'attendance': return { key: 'id', auto: true, idx: [{ name: 'employeeId', key: 'employeeId' }, { name: 'date', key: 'date' }] };
            case 'payroll': return { key: 'id', auto: true, idx: [{ name: 'employeeId', key: 'employeeId' }, { name: 'period', key: 'period' }] };
            case 'leaveRequests': return { key: 'id', auto: true, idx: [{ name: 'employeeId', key: 'employeeId' }, { name: 'date', key: 'date' }] };
            case 'customers': return { key: 'id', auto: true };
            case 'suppliers': return { key: 'id', auto: true };
            case 'categories': return { key: 'id', auto: true };
            case 'products': return { key: 'id', auto: true, idx: [{ name: 'barcode', key: 'barcode' }, { name: 'categoryId', key: 'categoryId' }] };
            case 'serials': return { key: 'id', auto: true, idx: [{ name: 'productId', key: 'productId' }, { name: 'serialNumber', key: 'serialNumber', unique: true }, { name: 'status', key: 'status' }, { name: 'purchaseId', key: 'purchaseId' }, { name: 'invoiceId', key: 'invoiceId' }] };
            case 'warehouses': return { key: 'id', auto: true };
            case 'stockMovements': return { key: 'id', auto: true, idx: [{ name: 'productId', key: 'productId' }, { name: 'date', key: 'date' }] };
            case 'invoices': return { key: 'id', auto: true, idx: [{ name: 'number', key: 'number', unique: true }, { name: 'customerId', key: 'customerId' }, { name: 'date', key: 'date' }] };
            case 'invoiceReturns': return { key: 'id', auto: true, idx: [{ name: 'number', key: 'number', unique: true }, { name: 'date', key: 'date' }] };
            case 'purchases': return { key: 'id', auto: true, idx: [{ name: 'number', key: 'number', unique: true }, { name: 'supplierId', key: 'supplierId' }, { name: 'date', key: 'date' }] };
            case 'purchaseReturns': return { key: 'id', auto: true, idx: [{ name: 'number', key: 'number', unique: true }, { name: 'date', key: 'date' }] };
            case 'payments': return { key: 'id', auto: true, idx: [{ name: 'partyType', key: 'partyType' }, { name: 'date', key: 'date' }] };
            case 'expenses': return { key: 'id', auto: true, idx: [{ name: 'date', key: 'date' }] };
            case 'quotations': return { key: 'id', auto: true, idx: [{ name: 'number', key: 'number', unique: true }, { name: 'date', key: 'date' }] };
            case 'offers': return { key: 'id', auto: true, idx: [{ name: 'productId', key: 'productId' }] };
            case 'accounts': return { key: 'id', auto: true, idx: [{ name: 'code', key: 'code', unique: true }] };
            case 'journalEntries': return { key: 'id', auto: true, idx: [{ name: 'number', key: 'number', unique: true }, { name: 'date', key: 'date' }] };
            case 'projects': return { key: 'id', auto: true };
            case 'tasks': return { key: 'id', auto: true, idx: [{ name: 'status', key: 'status' }, { name: 'assigneeId', key: 'assigneeId' }] };
            default: return { key: 'id', auto: true };
        }
    }

    /* ---------- فتح قاعدة البيانات (Promise) ---------- */
    function openDB() {
        return new Promise((resolve, reject) => {
            if (_db) return resolve(_db);
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                Object.keys(schemaFor('settings')).length; // تعطيل تحسينات غير مستخدمة
                const STORES = [
                    'settings','sequences','roles','users','departments','employees','attendance','payroll','leaveRequests',
                    'customers','suppliers','categories','products','serials','warehouses','stockMovements',
                    'invoices','invoiceReturns','purchases','purchaseReturns','payments','expenses','quotations','offers',
                    'accounts','journalEntries','projects','tasks'
                ];
                STORES.forEach((s) => {
                    if (!db.objectStoreNames.contains(s)) {
                        const cfg = schemaFor(s);
                        const os = cfg.key && cfg.key !== 'id' && cfg.auto === undefined
                            ? db.createObjectStore(s, { keyPath: cfg.key })
                            : db.createObjectStore(s, { keyPath: cfg.key || 'id', autoIncrement: !!cfg.auto });
                        (cfg.idx || []).forEach((i) => os.createIndex(i.name, i.key, { unique: !!i.unique }));
                    }
                });
            };
            req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /* ---------- عمليات عامة ---------- */
    function txn(store, mode, fn) {
        return openDB().then((db) => new Promise((resolve, reject) => {
            const tx = db.transaction(store, mode);
            const os = tx.objectStore(store);
            const out = fn(os, tx);
            tx.oncomplete = () => resolve(out && out.then ? out : out !== undefined ? out : undefined);
            tx.onerror = (e) => reject(e.target.error);
            tx.onabort = (e) => reject(e.target.error);
        }));
    }

    /* ---------- عمليات محلية مباشرة (IndexedDB) ---------- */
    function localGetAll(store) {
        return txn(store, 'readonly', (os) => new Promise((res, rej) => {
            const r = os.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        }));
    }

    function localGetById(store, id) {
        return txn(store, 'readonly', (os) => new Promise((res, rej) => {
            const req1 = os.get(id);
            req1.onsuccess = () => {
                if (req1.result !== undefined) return res(req1.result);
                const altId = (typeof id === 'number') ? String(id) : (!isNaN(Number(id)) ? Number(id) : null);
                if (altId !== null) {
                    const req2 = os.get(altId);
                    req2.onsuccess = () => res(req2.result);
                    req2.onerror = () => res(undefined);
                } else {
                    res(undefined);
                }
            };
            req1.onerror = () => rej(req1.error);
        }));
    }

    function localAdd(store, data, skipPush = false) {
        return txn(store, 'readwrite', (os) => new Promise((res, rej) => {
            const r = os.add(data);
            r.onsuccess = () => {
                if (!skipPush && typeof API !== 'undefined' && API.pushItemToCloud) {
                    API.pushItemToCloud(store, data, 'save');
                }
                res(r.result);
            };
            r.onerror = () => rej(r.error);
        }));
    }

    function localPut(store, data, skipPush = false) {
        return txn(store, 'readwrite', (os) => new Promise((res, rej) => {
            const r = os.put(data);
            r.onsuccess = () => {
                if (!skipPush && typeof API !== 'undefined' && API.pushItemToCloud) {
                    API.pushItemToCloud(store, data, 'save');
                }
                res(r.result);
            };
            r.onerror = () => rej(r.error);
        }));
    }

    function bulkPut(store, items, skipPush = true) {
        if (!items || !items.length) return Promise.resolve();
        return txn(store, 'readwrite', (os) => new Promise((res, rej) => {
            for (const item of items) {
                if (item) os.put(item);
            }
            if (!skipPush && typeof API !== 'undefined' && API.pushItemToCloud) {
                for (const item of items) {
                    if (item) API.pushItemToCloud(store, item, 'save');
                }
            }
            res();
        }));
    }

    function localUpdate(store, id, patch, skipPush = false) {
        return localGetById(store, id).then((rec) => {
            if (!rec) throw new Error('record not found: ' + id);
            const merged = Object.assign({}, rec, patch, { id: rec.id });
            return localPut(store, merged, skipPush);
        });
    }

    function localRemove(store, id, skipPush = false) {
        return txn(store, 'readwrite', (os) => new Promise((res, rej) => {
            os.delete(id);
            if (typeof id === 'number') {
                os.delete(String(id));
            } else if (typeof id === 'string' && !isNaN(Number(id))) {
                os.delete(Number(id));
            }
            if (!skipPush && typeof API !== 'undefined' && API.pushItemToCloud) {
                API.pushItemToCloud(store, { id }, 'delete');
            }
            res();
        }));
    }

    function bulkRemove(store, ids, skipPush = true) {
        if (!ids || !ids.length) return Promise.resolve();
        return txn(store, 'readwrite', (os) => new Promise((res, rej) => {
            for (const id of ids) {
                if (id == null) continue;
                os.delete(id);
                if (typeof id === 'number') os.delete(String(id));
                else if (typeof id === 'string' && !isNaN(Number(id))) os.delete(Number(id));
            }
            res();
        }));
    }

    /* ---------- عمليات عامة (توجيه كـ API Proxy) ---------- */
    function getAll(store) {
        if (typeof API !== 'undefined' && API.isApiModeEnabled()) {
            return API.getAll(store);
        }
        return localGetAll(store);
    }

    function getById(store, id) {
        if (typeof API !== 'undefined' && API.isApiModeEnabled()) {
            return API.getById(store, id);
        }
        return localGetById(store, id);
    }

    function getByIndex(store, index, value) {
        return txn(store, 'readonly', (os) => new Promise((res, rej) => {
            const r = os.index(index).getAll(value);
            r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        }));
    }

    function add(store, data) {
        if (typeof API !== 'undefined' && API.isApiModeEnabled()) {
            return API.add(store, data);
        }
        return localAdd(store, data);
    }

    function put(store, data) {
        if (typeof API !== 'undefined' && API.isApiModeEnabled()) {
            return API.update(store, data);
        }
        return localPut(store, data);
    }

    function update(store, id, patch) {
        if (typeof API !== 'undefined' && API.isApiModeEnabled()) {
            return API.getById(store, id).then((rec) => {
                const merged = Object.assign({}, rec || {}, patch, { id: id });
                return API.update(store, merged);
            });
        }
        return localUpdate(store, id, patch);
    }

    function remove(store, id) {
        if (typeof API !== 'undefined' && API.isApiModeEnabled()) {
            return API.delete(store, id);
        }
        return localRemove(store, id);
    }

    /* ---------- الأرقام التسلسلية للفواتير ---------- */
    async function nextSeq(name, prefix, pad) {
        let cur = 0;
        try {
            const targetStore = (name.includes('invoice') || name === 'sales') ? 'invoices' :
                                (name.includes('journal') || name.includes('JRN')) ? 'journalEntries' :
                                (name.includes('purchase') || name.includes('PUR')) ? 'purchases' : null;
            if (targetStore) {
                const existing = await localGetAll(targetStore);
                if (existing && existing.length) {
                    existing.forEach(item => {
                        if (item && item.number && String(item.number).startsWith(prefix)) {
                            const numPart = parseInt(String(item.number).replace(prefix, ''), 10);
                            if (!isNaN(numPart) && numPart > cur) {
                                cur = numPart;
                            }
                        }
                    });
                }
            }
        } catch(e) {}

        return txn('sequences', 'readwrite', (os) => new Promise((res, rej) => {
            const getR = os.get(name);
            getR.onsuccess = () => {
                const seqVal = getR.result ? Number(getR.result.value || 0) : 0;
                const next = Math.max(cur, seqVal) + 1;
                os.put({ name, value: next });
                if (typeof API !== 'undefined') {
                    API.pushItemToCloud('sequences', { name, value: next }, 'save');
                }
                const digits = String(next).padStart(pad || 5, '0');
                res((prefix || '') + digits);
            };
            getR.onerror = () => rej(getR.error);
        }));
    }

    /* ---------- البيانات الافتراضية (Seed) ---------- */
    async function seed() {
        const count = await localGetAll('users');
        if (count && count.length) return;

        const now = Date.now();

        // الصلاحيات
        const roles = [
            { id: 1, name: 'مدير', description: 'صلاحيات كاملة على كل الوحدات', permissions: ['accounting', 'inventory', 'hr', 'business', 'settings'] },
            { id: 2, name: 'محاسب', description: 'المحاسبة والتقارير والمخزون', permissions: ['accounting', 'inventory', 'business'] },
            { id: 3, name: 'مشرف مخزن', description: 'المخزون والمشتريات والمنتجات', permissions: ['inventory'] },
            { id: 4, name: 'موظف', description: 'الصلاحيات الأساسية', permissions: ['business'] }
        ];
        for (const r of roles) await localPut('roles', r);

        // مستخدم مدير رئيسي — كلمة السر: admin123
        await localPut('users', {
            id: 1, username: 'admin', password: hashPassword('admin123'), name: 'مدير النظام',
            roleId: 1, roleName: 'مدير', active: true, createdAt: now
        });

        // الأقسام
        const deps = [
            { id: 1, name: 'الإدارة العامة', description: '' },
            { id: 2, name: 'المبيعات', description: '' },
            { id: 3, name: 'المخزون واللوجستيات', description: '' }
        ];
        for (const d of deps) await localPut('departments', d);

        // المخازن
        await localPut('warehouses', { id: 1, name: 'المخزن الرئيسي', location: '', manager: '', description: '' });

        // شجرة الحسابات الأولية
        const accounts = [
            { id: 1, code: '1000', name: 'الأصول', type: 'asset', parentId: null },
            { id: 2, code: '1100', name: 'النقدية', type: 'asset', parentId: 1 },
            { id: 3, code: '1101', name: 'صندوق النقدية', type: 'asset', parentId: 2 },
            { id: 4, code: '1200', name: 'حسابات العملاء', type: 'asset', parentId: 1 },
            { id: 5, code: '1300', name: 'المخزون', type: 'asset', parentId: 1 },
            { id: 6, code: '2000', name: 'الخصوم', type: 'liability', parentId: null },
            { id: 7, code: '2100', name: 'حسابات الموردين', type: 'liability', parentId: 6 },
            { id: 8, code: '3000', name: 'حقوق الملكية', type: 'equity', parentId: null },
            { id: 9, code: '3100', name: 'رأس المال', type: 'equity', parentId: 8 },
            { id: 10, code: '4000', name: 'الإيرادات', type: 'income', parentId: null },
            { id: 11, code: '4100', name: 'مبيعات', type: 'income', parentId: 10 },
            { id: 12, code: '5000', name: 'المصروفات', type: 'expense', parentId: null },
            { id: 13, code: '5100', name: 'المصروفات التشغيلية', type: 'expense', parentId: 12 },
            { id: 14, code: '5200', name: 'المشتريات', type: 'expense', parentId: 12 }
        ];
        for (const a of accounts) await localPut('accounts', a);

        await localPut('settings', { key: 'companyName', value: 'AR-Program' });
        await localPut('settings', { key: 'currency', value: 'ج.م' });
        await localPut('settings', { key: 'seeded', value: String(now) });
    }

    /* ---------- حماية كلمة السر (Hash بسيط غير قابل للعكس) ---------- */
    function hashPassword(pw) {
        let h = 5381;
        const s = 'arprogram::' + pw + '::erp';
        for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
        return 'h' + h.toString(16) + '_' + s.length;
    }

    /* ---------- مزامنة الأرصدة الافتتاحية في الدورة المحاسبية ---------- */
    async function syncOpeningBalances() {
        try {
            const [customers, suppliers, entries] = await Promise.all([
                getAll('customers'),
                getAll('suppliers'),
                getAll('journalEntries')
            ]);

            const entryRefMap = {};
            (entries || []).forEach(e => {
                if (e && e.refId) entryRefMap[e.refId] = e;
            });

            // 1. العملاء (حسابات العملاء 4 / رأس المال 9)
            for (const c of (customers || [])) {
                if (!c || !c.id) continue;
                const refId = 'cust_opening_' + c.id;
                const openBal = Number(c.openingBalance || 0);
                const existingEntry = entryRefMap[refId];

                if (openBal > 0) {
                    const entryData = {
                        number: existingEntry ? existingEntry.number : await nextSeq('journalAuto', 'JRN-', 6),
                        date: c.createdAt || Date.now(),
                        desc: 'رصيد افتتاحي للعميل: ' + c.name,
                        refId: refId,
                        lines: [
                            { accountId: 4, debit: openBal, credit: 0 },
                            { accountId: 9, debit: 0, credit: openBal }
                        ]
                    };
                    if (existingEntry) {
                        await put('journalEntries', { ...existingEntry, ...entryData });
                    } else {
                        await add('journalEntries', entryData);
                    }
                } else if (existingEntry) {
                    await remove('journalEntries', existingEntry.id);
                }
            }

            // 2. الموردون (رأس المال 9 / حسابات الموردين 7)
            for (const s of (suppliers || [])) {
                if (!s || !s.id) continue;
                const refId = 'sup_opening_' + s.id;
                const openBal = Number(s.openingBalance || 0);
                const existingEntry = entryRefMap[refId];

                if (openBal > 0) {
                    const entryData = {
                        number: existingEntry ? existingEntry.number : await nextSeq('journalAuto', 'JRN-', 6),
                        date: s.createdAt || Date.now(),
                        desc: 'رصيد افتتاحي للمورد: ' + s.name,
                        refId: refId,
                        lines: [
                            { accountId: 9, debit: openBal, credit: 0 },
                            { accountId: 7, debit: 0, credit: openBal }
                        ]
                    };
                    if (existingEntry) {
                        await put('journalEntries', { ...existingEntry, ...entryData });
                    } else {
                        await add('journalEntries', entryData);
                    }
                } else if (existingEntry) {
                    await remove('journalEntries', existingEntry.id);
                }
            }
        } catch (e) {
            console.error('Error syncing opening balances:', e);
        }
    }

    /* ---------- الجلسة ---------- */
    function currentUser() {
        try { return JSON.parse(localStorage.getItem('ar_session') || 'null'); }
        catch (e) { return null; }
    }
    function setSession(u) { localStorage.setItem('ar_session', JSON.stringify(u)); }
    function clearSession() { localStorage.removeItem('ar_session'); }

    /* ---------- المبالغ ---------- */
    function money(n) {
        const v = Number(n || 0);
        return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    async function clearAllData() {
        const STORES = [
            'settings','sequences','roles','users','departments','employees','attendance','payroll','leaveRequests',
            'customers','suppliers','categories','products','serials','warehouses','stockMovements',
            'invoices','invoiceReturns','purchases','purchaseReturns','payments','expenses','quotations','offers',
            'accounts','journalEntries','projects','tasks'
        ];
        for (const s of STORES) {
            try {
                await txn(s, 'readwrite', (os) => new Promise((res, rej) => {
                    const r = os.clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error);
                }));
            } catch(e){}
        }
    }

    return {
        openDB, getAll, getById, getByIndex, add, put, update, remove,
        localGetAll, localGetById, localAdd, localPut, localUpdate, localRemove, bulkPut, bulkRemove, clearAllData,
        nextSeq, seed, syncOpeningBalances, hashPassword, currentUser, setSession, clearSession, money
    };
})();

/* جاهزية قاعدة البيانات للمتصفح كله */
ARDB.openDB().then(() => ARDB.seed().then(() => ARDB.syncOpeningBalances())).catch((e) => console.error('DB init error:', e));