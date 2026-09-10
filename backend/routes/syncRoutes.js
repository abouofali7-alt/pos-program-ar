const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const SYNC_FILE = process.env.VERCEL ? '/tmp/ar_cloud_sync.json' : path.join(__dirname, '..', 'ar_cloud_sync.json');
let _remoteObjectId = 'ff808181a067127101a0818dc3d24b44';

if (!global._ar_cloud_data) {
    global._ar_cloud_data = { lastUpdated: Date.now(), data: {}, deleted: {} };
    try {
        if (fs.existsSync(SYNC_FILE)) {
            const raw = fs.readFileSync(SYNC_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && parsed.data) {
                global._ar_cloud_data = parsed;
            }
        }
    } catch(e) {}
}

let _isLoadedFromRemote = false;

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

function getCloudData() {
    if (!global._ar_cloud_data) {
        global._ar_cloud_data = { lastUpdated: Date.now(), resetTimestamp: 0, data: {}, deleted: {} };
        try {
            if (fs.existsSync(SYNC_FILE)) {
                const raw = fs.readFileSync(SYNC_FILE, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && parsed.data) {
                    global._ar_cloud_data = parsed;
                }
            }
        } catch(e) {}
    }
    return global._ar_cloud_data;
}

function initRemoteHydration() {
    if (_isLoadedFromRemote) return;
    _isLoadedFromRemote = true;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        fetch(`https://api.restful-api.dev/objects/${_remoteObjectId}`, { signal: controller.signal })
            .then(r => r.ok ? r.json() : null)
            .then(json => {
                if (json && json.data && json.data.lastUpdated) {
                    if (!global._ar_cloud_data || (json.data.lastUpdated > (global._ar_cloud_data.lastUpdated || 0))) {
                        global._ar_cloud_data = json.data;
                        try { fs.writeFileSync(SYNC_FILE, JSON.stringify(global._ar_cloud_data), 'utf8'); } catch(e){}
                    }
                }
            }).catch(() => {});
    } catch(e) {}
}
initRemoteHydration();

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

function saveCloudData(cloudObj) {
    global._ar_cloud_data = cloudObj;
    _isLoadedFromRemote = true;
    try {
        fs.writeFileSync(SYNC_FILE, JSON.stringify(cloudObj), 'utf8');
    } catch(e) {}

    // Async background persistence to external remote storage without delaying HTTP response
    saveToRemote(cloudObj).catch(() => {});
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
        const { store, item, action, fullData, batch } = req.body || {};
        const cloud = getCloudData();
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
                    if (itId) {
                        cloud.deleted[s] = cloud.deleted[s].filter(id => String(id) !== String(itId));
                    }
                    const idx = cloud.data[s].findIndex(x => isMatch(x, it));
                    if (idx >= 0) {
                        cloud.data[s][idx] = it;
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
        await saveCloudData(cloud);
        res.json({ success: true, lastUpdated: cloud.lastUpdated, deleted: cloud.deleted });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 2. GET /api/sync/pull — الأجهزة الأخرى تسحب أحدث حركة فوراً
router.get('/pull', async (req, res) => {
    try {
        const cloud = getCloudData();
        res.json({
            success: true,
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
        const now = Date.now();
        const resetObj = { lastUpdated: now, resetTimestamp: now, data: {}, deleted: {}, reset: false };
        await saveCloudData(resetObj);
        res.json({ success: true, message: 'Cloud database reset successfully', lastUpdated: now, resetTimestamp: now });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
