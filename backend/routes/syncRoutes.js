const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const SYNC_FILE = process.env.VERCEL ? '/tmp/ar_cloud_sync.json' : path.join(__dirname, '..', 'ar_cloud_sync.json');
let _remoteObjectId = 'ff808181a067127101a0818dc3d24b44';

let _isHydrated = false;
let _hydrationPromise = null;

async function ensureHydrated() {
    if (_isHydrated && global._ar_cloud_data && global._ar_cloud_data.lastUpdated) {
        return global._ar_cloud_data;
    }
    if (_hydrationPromise) {
        await _hydrationPromise;
        return global._ar_cloud_data || { lastUpdated: Date.now(), resetTimestamp: 0, data: {}, deleted: {} };
    }

    _hydrationPromise = (async () => {
        if (!global._ar_cloud_data) {
            global._ar_cloud_data = { lastUpdated: Date.now(), resetTimestamp: 0, data: {}, deleted: {} };
        }
        try {
            if (fs.existsSync(SYNC_FILE)) {
                const raw = fs.readFileSync(SYNC_FILE, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && parsed.lastUpdated) {
                    global._ar_cloud_data = parsed;
                }
            }
        } catch(e) {}

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(`https://api.restful-api.dev/objects/${_remoteObjectId}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                const json = await res.json();
                if (json && json.data && json.data.lastUpdated) {
                    const remoteData = json.data;
                    const localTs = global._ar_cloud_data ? (global._ar_cloud_data.lastUpdated || 0) : 0;
                    if (remoteData.lastUpdated >= localTs) {
                        global._ar_cloud_data = remoteData;
                        try { fs.writeFileSync(SYNC_FILE, JSON.stringify(remoteData), 'utf8'); } catch(e){}
                    }
                }
            }
        } catch(e) {}

        _isHydrated = true;
        return global._ar_cloud_data;
    })();

    await _hydrationPromise;
    _hydrationPromise = null;
    return global._ar_cloud_data;
}

async function createRemoteObject(cloudObj) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch('https://api.restful-api.dev/objects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'pos_sync_cloud', data: cloudObj || global._ar_cloud_data }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.ok) {
            const json = await res.json();
            if (json && json.id) {
                _remoteObjectId = json.id;
                return true;
            }
        }
    } catch(e) {}
    return false;
}

async function saveToRemote(cloudObj) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(`https://api.restful-api.dev/objects/${_remoteObjectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'pos_sync_cloud', data: cloudObj }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
            await createRemoteObject(cloudObj);
        }
    } catch(e) {
        await createRemoteObject(cloudObj);
    }
}

async function saveCloudData(cloudObj, awaitRemote = false) {
    global._ar_cloud_data = cloudObj;
    _isHydrated = true;
    try {
        fs.writeFileSync(SYNC_FILE, JSON.stringify(cloudObj), 'utf8');
    } catch(e) {}

    if (awaitRemote || (cloudObj && cloudObj.resetTimestamp)) {
        try {
            await saveToRemote(cloudObj);
        } catch(e) {}
    } else {
        saveToRemote(cloudObj).catch(() => {});
    }
}

function getItemId(x) {
    if (!x) return null;
    if (x.id !== undefined && x.id !== null) return String(x.id);
    if (x.key !== undefined && x.key !== null) return String(x.key);
    return null;
}

function isMatch(x, y) {
    if (!x || !y) return false;
    const idX = getItemId(x);
    const idY = getItemId(y);
    return idX !== null && idY !== null && idX === idY;
}

// 1. POST /api/sync/push — أي جهاز يرفع معاملة أو صنف جديد
router.post('/push', async (req, res) => {
    try {
        const cloud = await ensureHydrated();
        const { store, item, action, fullData, batch, clientResetTs } = req.body || {};

        const cloudResetTs = Number(cloud.resetTimestamp || 0);
        const reqClientResetTs = Number(clientResetTs || 0);

        if (cloudResetTs > 0 && reqClientResetTs < cloudResetTs) {
            return res.json({
                success: false,
                reset: true,
                resetTimestamp: cloudResetTs,
                message: 'Stale push rejected due to prior cloud reset'
            });
        }

        if (!cloud.data) cloud.data = {};
        if (!cloud.deleted) cloud.deleted = {};

        const itemsToProcess = [];
        if (batch && Array.isArray(batch)) {
            itemsToProcess.push(...batch);
        } else if (store && item) {
            itemsToProcess.push({ store, item, action });
        }

        if (fullData && typeof fullData === 'object') {
            for (const s of Object.keys(fullData)) {
                const incoming = fullData[s] || [];
                if (!cloud.data[s]) cloud.data[s] = [];
                if (!cloud.deleted[s]) cloud.deleted[s] = [];

                for (const it of incoming) {
                    if (!it) continue;
                    const itId = getItemId(it);
                    if (itId && cloud.deleted[s] && cloud.deleted[s].some(id => String(id) === String(itId))) {
                        continue;
                    }
                    const idx = cloud.data[s].findIndex(x => isMatch(x, it));
                    if (idx >= 0) {
                        const existing = cloud.data[s][idx];
                        const existingTs = Number(existing.updatedAt || existing.createdAt || 0);
                        const incomingTs = Number(it.updatedAt || it.createdAt || 0);
                        if (incomingTs >= existingTs) {
                            cloud.data[s][idx] = it;
                        }
                    } else {
                        cloud.data[s].push(it);
                    }
                }
            }
        }

        for (const entry of itemsToProcess) {
            const s = entry.store;
            const it = entry.item;
            const act = entry.action || 'save';
            if (!s || !it) continue;

            if (!cloud.data[s]) cloud.data[s] = [];
            if (!cloud.deleted[s]) cloud.deleted[s] = [];
            const itemId = getItemId(it);

            if (act === 'delete') {
                cloud.data[s] = cloud.data[s].filter(x => !isMatch(x, it));
                if (itemId && !cloud.deleted[s].includes(itemId)) {
                    cloud.deleted[s].push(itemId);
                }
            } else {
                const idx = cloud.data[s].findIndex(x => isMatch(x, it));
                if (idx >= 0) {
                    cloud.data[s][idx] = it;
                } else {
                    cloud.data[s].push(it);
                }
                if (itemId) {
                    cloud.deleted[s] = cloud.deleted[s].filter(id => String(id) !== String(itemId));
                }
            }
        }

        cloud.lastUpdated = Date.now();
        cloud.reset = false;
        await saveCloudData(cloud, false);
        res.json({ success: true, lastUpdated: cloud.lastUpdated, deleted: cloud.deleted });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 2. GET /api/sync/pull — السحب السريع مع خاصية الدلتا والتأكد من عدم وجود تغييرات
router.get('/pull', async (req, res) => {
    try {
        const cloud = await ensureHydrated();
        const clientSince = Number(req.query.since || 0);

        if (clientSince > 0 && cloud.lastUpdated && cloud.lastUpdated <= clientSince && !cloud.reset) {
            return res.json({
                success: true,
                unchanged: true,
                lastUpdated: cloud.lastUpdated,
                resetTimestamp: cloud.resetTimestamp || 0
            });
        }

        res.json({
            success: true,
            unchanged: false,
            lastUpdated: cloud.lastUpdated || Date.now(),
            resetTimestamp: cloud.resetTimestamp || 0,
            reset: !!cloud.reset,
            data: cloud.data || {},
            deleted: cloud.deleted || {}
        });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 3. POST /api/sync/reset — تفريغ ورسترة كافة بيانات السيرفر والداتا بيز السحابية
router.post('/reset', async (req, res) => {
    try {
        await ensureHydrated();
        const now = Date.now();
        const resetObj = { lastUpdated: now, resetTimestamp: now, data: {}, deleted: {}, reset: false };
        await saveCloudData(resetObj, true);
        res.json({ success: true, message: 'Cloud database reset successfully', lastUpdated: now, resetTimestamp: now });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
