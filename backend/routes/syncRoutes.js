const express = require('express');
const router = express.Router();

const WEBHOOK_TOKEN = '869e97e1-323f-47d2-ba50-6082983bffcf';
let _memoryCache = { lastUpdated: Date.now(), data: {} };

async function loadCloudData() {
    try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`https://webhook.site/token/${WEBHOOK_TOKEN}/requests?sorting=newest`, { signal: controller.signal });
        clearTimeout(tid);
        if (res.ok) {
            const json = await res.json();
            if (json.data && json.data.length > 0 && json.data[0].content) {
                const parsed = JSON.parse(json.data[0].content);
                if (parsed && typeof parsed === 'object' && parsed.data) {
                    _memoryCache = parsed;
                    return parsed;
                }
            }
        }
    } catch(e) {}
    return _memoryCache;
}

async function saveCloudData(cloudObj) {
    _memoryCache = cloudObj;
    try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        await fetch(`https://webhook.site/${WEBHOOK_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cloudObj),
            signal: controller.signal
        });
        clearTimeout(tid);
    } catch(e) {}
}

// 1. POST /api/sync/push — أي جهاز يرفع معاملة أو صنف جديد
router.post('/push', async (req, res) => {
    try {
        const { store, item, action, fullData } = req.body || {};
        const cloud = await loadCloudData();
        if (!cloud.data) cloud.data = {};
        
        if (fullData && typeof fullData === 'object') {
            for (const s of Object.keys(fullData)) {
                cloud.data[s] = fullData[s];
            }
        } else if (store && item) {
            if (!cloud.data[store]) cloud.data[store] = [];
            if (action === 'delete') {
                cloud.data[store] = cloud.data[store].filter(x => (x.id && x.id !== item.id) || (x.key && x.key !== item.key));
            } else {
                const idx = cloud.data[store].findIndex(x => (x.id && item.id && x.id === item.id) || (x.key && item.key && x.key === item.key));
                if (idx >= 0) cloud.data[store][idx] = item;
                else cloud.data[store].push(item);
            }
        }
        
        cloud.lastUpdated = Date.now();
        await saveCloudData(cloud);
        res.json({ success: true, lastUpdated: cloud.lastUpdated });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 2. GET /api/sync/pull — الأجهزة الأخرى تسحب أحدث حركة فوراً
router.get('/pull', async (req, res) => {
    try {
        const cloud = await loadCloudData();
        res.json({ success: true, lastUpdated: cloud.lastUpdated || Date.now(), data: cloud.data || {} });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
