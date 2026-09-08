const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const SYNC_FILE = process.env.VERCEL ? '/tmp/ar_cloud_sync.json' : path.join(__dirname, '..', 'ar_cloud_sync.json');
const REMOTE_CLOUD_URL = 'https://api.restful-api.dev/objects/ff808181a067127101a0818dc3d24b44';

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

async function loadCloudData() {
    const isEmpty = !global._ar_cloud_data || !global._ar_cloud_data.data || Object.keys(global._ar_cloud_data.data).length === 0;
    if (isEmpty) {
        try {
            const res = await fetch(REMOTE_CLOUD_URL);
            if (res.ok) {
                const json = await res.json();
                if (json && json.data && typeof json.data === 'object' && json.data.data) {
                    global._ar_cloud_data = json.data;
                    try { fs.writeFileSync(SYNC_FILE, JSON.stringify(global._ar_cloud_data), 'utf8'); } catch(e) {}
                }
            }
        } catch(e) {}
    }
    return global._ar_cloud_data;
}

function saveCloudData(cloudObj) {
    global._ar_cloud_data = cloudObj;
    setImmediate(() => {
        try {
            fs.writeFileSync(SYNC_FILE, JSON.stringify(cloudObj), 'utf8');
        } catch(e) {}
        try {
            fetch(REMOTE_CLOUD_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'pos_sync_cloud', data: cloudObj })
            }).catch(() => {});
        } catch(e) {}
    });
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
                    const idx = cloud.data[s].findIndex(x => isMatch(x, it));
                    if (idx >= 0) {
                        cloud.data[s][idx] = it;
                    } else {
                        cloud.data[s].push(it);
                    }
                    if (itId) {
                        cloud.deleted[s] = cloud.deleted[s].filter(id => String(id) !== itId);
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
        saveCloudData(cloud);
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
        const resetObj = { lastUpdated: now, resetTimestamp: now, data: {}, deleted: {}, reset: true };
        saveCloudData(resetObj);
        res.json({ success: true, message: 'Cloud database reset successfully', lastUpdated: now, resetTimestamp: now });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
