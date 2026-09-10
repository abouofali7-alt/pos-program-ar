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

async function loadCloudData() {
    if (_isLoadedFromRemote && global._ar_cloud_data) {
        return global._ar_cloud_data;
    }
    try {
        if (fs.existsSync(SYNC_FILE)) {
            const raw = fs.readFileSync(SYNC_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && parsed.data) {
                global._ar_cloud_data = parsed;
                _isLoadedFromRemote = true;
                return global._ar_cloud_data;
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
            if (json && json.data && typeof json.data === 'object' && json.data.lastUpdated !== undefined) {
                global._ar_cloud_data = json.data;
                _isLoadedFromRemote = true;
                try { fs.writeFileSync(SYNC_FILE, JSON.stringify(global._ar_cloud_data), 'utf8'); } catch(e) {}
                return global._ar_cloud_data;
            }
        } else if (res.status === 404) {
            // Object expired or missing, auto-create a new one!
            await createRemoteObject(global._ar_cloud_data);
        }
    } catch(e) {}

    if (!global._ar_cloud_data) {
        global._ar_cloud_data = { lastUpdated: Date.now(), resetTimestamp: 0, data: {}, deleted: {} };
    }
    return global._ar_cloud_data;
}

async function saveCloudData(cloudObj) {
    global._ar_cloud_data = cloudObj;
    _isLoadedFromRemote = true;
    try {
        fs.writeFileSync(SYNC_FILE, JSON.stringify(cloudObj), 'utf8');
    } catch(e) {}

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
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
        const cloud = await loadCloudData();
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
                    if (itId && cloud.deleted[s].map(String).includes(String(itId))) {
                        // هذا العنصر محذوف صراحة على السحابة، يتوجب استبعاده وعدم إعادته من الجهاز المحلّي
                        continue;
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
                    cloud.deleted[s] = cloud.deleted[s].filter(id => String(id) !== itemId);
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
        const cloud = await loadCloudData();
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
