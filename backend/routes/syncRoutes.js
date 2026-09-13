const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const LOCAL_SYNC_FILE = path.join(__dirname, '..', 'ar_cloud_sync.json');
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const USE_DB = !!DB_URL;
const ON_VERCEL = !!process.env.VERCEL;

let _pg = null;
let _tableReady = false;
let _tableReadyPromise = null;

function EMPTY_BLOB() {
    return { lastUpdated: Date.now(), resetTimestamp: 0, data: {}, deleted: {}, reset: false };
}

const UNAVAILABLE_MSG = 'Cloud sync storage is not configured. On Vercel, set the DATABASE_URL environment variable (Postgres/Neon) to enable cross-device sync.';

async function getDb() {
    if (!USE_DB) return null;
    if (!_pg) {
        const { Pool } = require('pg');
        const ssl = DB_URL.includes('localhost') || DB_URL.includes('127.0.0.1')
            ? false
            : { rejectUnauthorized: false };
        _pg = new Pool({
            connectionString: DB_URL,
            ssl,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
        });
    }
    if (!_tableReady) {
        if (!_tableReadyPromise) {
            _tableReadyPromise = (async () => {
                await _pg.query(`CREATE TABLE IF NOT EXISTS ar_cloud_sync (
                    id INTEGER PRIMARY KEY,
                    payload JSONB NOT NULL,
                    updated_at BIGINT NOT NULL
                )`);
                await _pg.query(
                    'INSERT INTO ar_cloud_sync (id, payload, updated_at) VALUES (1, $1::jsonb, $2) ON CONFLICT (id) DO NOTHING',
                    [JSON.stringify(EMPTY_BLOB()), Date.now()]
                );
            })();
        }
        await _tableReadyPromise;
        _tableReady = true;
    }
    return _pg;
}

async function loadBlob() {
    if (USE_DB) {
        const db = await getDb();
        const { rows } = await db.query('SELECT payload FROM ar_cloud_sync WHERE id = 1');
        if (rows.length && rows[0].payload) {
            return Object.assign(EMPTY_BLOB(), rows[0].payload);
        }
        return EMPTY_BLOB();
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(LOCAL_SYNC_FILE, 'utf8'));
        if (parsed && typeof parsed === 'object' && parsed.lastUpdated) {
            return parsed;
        }
    } catch (e) {}
    return EMPTY_BLOB();
}

async function saveBlobFile(blob) {
    try {
        fs.writeFileSync(LOCAL_SYNC_FILE, JSON.stringify(blob), 'utf8');
    } catch (e) {}
}

async function withLockedBlob(fn) {
    const db = await getDb();
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT payload FROM ar_cloud_sync WHERE id = 1 FOR UPDATE');
        const blob = rows.length && rows[0].payload
            ? Object.assign(EMPTY_BLOB(), rows[0].payload)
            : EMPTY_BLOB();
        const result = await fn(blob);
        await client.query(
            'UPDATE ar_cloud_sync SET payload = $1::jsonb, updated_at = $2 WHERE id = 1',
            [JSON.stringify(result), Date.now()]
        );
        await client.query('COMMIT');
        return result;
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        throw e;
    } finally {
        client.release();
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

function applyPush(cloud, body) {
    const { store, item, action, fullData, batch } = body || {};

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
    return cloud;
}

function processPush(cloud, body) {
    const cloudResetTs = Number(cloud.resetTimestamp || 0);
    const reqClientResetTs = Number((body && body.clientResetTs) || 0);
    if (cloudResetTs > 0 && reqClientResetTs < cloudResetTs) {
        return {
            stale: true,
            resetTimestamp: cloudResetTs,
            message: 'Stale push rejected due to prior cloud reset'
        };
    }
    return { blob: applyPush(cloud, body) };
}

function unavailable(res) {
    return res.status(503).json({ success: false, error: UNAVAILABLE_MSG });
}

// 1. POST /api/sync/push — أي جهاز يرفع معاملة أو صنف جديد
router.post('/push', async (req, res) => {
    try {
        if (!USE_DB && ON_VERCEL) return unavailable(res);

        if (USE_DB) {
            const result = await withLockedBlob((cloud) => {
                const out = processPush(cloud, req.body || {});
                if (out.stale) return { __stale: out };
                return out.blob;
            });
            if (result && result.__stale) {
                return res.json({
                    success: false,
                    reset: true,
                    resetTimestamp: result.__stale.resetTimestamp,
                    message: result.__stale.message
                });
            }
            return res.json({ success: true, lastUpdated: result.lastUpdated, deleted: result.deleted || {} });
        }

        const cloud = await loadBlob();
        const out = processPush(cloud, req.body || {});
        if (out.stale) {
            return res.json({
                success: false,
                reset: true,
                resetTimestamp: out.resetTimestamp,
                message: out.message
            });
        }
        await saveBlobFile(out.blob);
        res.json({ success: true, lastUpdated: out.blob.lastUpdated, deleted: out.blob.deleted || {} });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 2. GET /api/sync/pull — السحب السريع مع خاصية الدلتا والتأكد من عدم وجود تغييرات
router.get('/pull', async (req, res) => {
    try {
        if (!USE_DB && ON_VERCEL) return unavailable(res);

        const cloud = await loadBlob();
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
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 3. POST /api/sync/reset — تفريغ ورسترة كافة بيانات السيرفر والداتا بيز السحابية
router.post('/reset', async (req, res) => {
    try {
        if (!USE_DB && ON_VERCEL) return unavailable(res);

        const now = Date.now();
        const fresh = { lastUpdated: now, resetTimestamp: now, data: {}, deleted: {}, reset: false };

        if (USE_DB) {
            await withLockedBlob(() => fresh);
        } else {
            await saveBlobFile(fresh);
        }

        res.json({ success: true, message: 'Cloud database reset successfully', lastUpdated: now, resetTimestamp: now });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;