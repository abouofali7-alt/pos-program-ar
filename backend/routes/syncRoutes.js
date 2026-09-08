const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const SYNC_FILE = process.env.VERCEL ? '/tmp/ar_cloud_sync.json' : path.join(__dirname, '..', 'ar_cloud_sync.json');

function loadCloudData() {
    try {
        if (fs.existsSync(SYNC_FILE)) {
            const raw = fs.readFileSync(SYNC_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch(e) {}
    return { lastUpdated: Date.now(), data: {} };
}

function saveCloudData(cloudObj) {
    try {
        fs.writeFileSync(SYNC_FILE, JSON.stringify(cloudObj, null, 2), 'utf8');
    } catch(e) {}
}

// 1. POST /api/sync/push — أي جهاز يرفع معاملة أو صنف جديد
router.post('/push', (req, res) => {
    try {
        const { store, item, action, fullData } = req.body || {};
        const cloud = loadCloudData();
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
        saveCloudData(cloud);
        res.json({ success: true, lastUpdated: cloud.lastUpdated });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 2. GET /api/sync/pull — الأجهزة الأخرى تسحب أحدث حركة فوراً
router.get('/pull', (req, res) => {
    try {
        const cloud = loadCloudData();
        res.json({ success: true, lastUpdated: cloud.lastUpdated || Date.now(), data: cloud.data || {} });
    } catch(e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
