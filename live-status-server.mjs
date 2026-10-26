// Same job as live-status.php, for an Iranian VPS with Node.js 18+.  Run:  node live-status-server.mjs
// Put it behind HTTPS (nginx/Caddy reverse proxy). Env: PORT (default 8787), APARAT_STATUS_URL (testing only).
import http from 'node:http';

const APARAT_URL = process.env.APARAT_STATUS_URL ||
    'https://www.aparat.com/api/fa/v2/Live/LiveStream/show/username/uniquetaha';
const PORT = Number(process.env.PORT || 8787);
const CACHE_TTL_MS = 30_000;
const ALLOWED_ORIGINS = new Set(['https://uniquetaha.ir', 'https://www.uniquetaha.ir']);
let cache = null; // { status, fetchedAt }

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

async function readAparat() {
    const res = await fetch(APARAT_URL, {
        headers: {
            Accept: 'application/json',
            'User-Agent': 'UniqueTahaLiveStatus/1.0 (+https://uniquetaha.ir)',
            Referer: 'https://www.aparat.com/uniquetaha/live'
        },
        signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`Aparat HTTP ${res.status}`);

    const data = await res.json();
    const candidates = [
        data?.live_status?.type,
        data?.live_status?.status,
        data?.live_type,
        data?.liveStatus?.type,
        data?.status,
        data?.result?.live_status?.type,
        data?.result?.live_type
    ];
    const type = candidates.find(value => typeof value === 'string')?.toLowerCase();
    if (type === 'live') return 'live';
    if (['nolive', 'end', 'offline', 'notlive', 'not_live'].includes(type)) return 'offline';
    throw new Error(`unrecognized live status: ${type}`);
}

export const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    const headers = { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' };
    if (ALLOWED_ORIGINS.has(origin)) {
        Object.assign(headers, {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Accept',
            'Access-Control-Max-Age': '86400'
        });
    }
    const send = (code, body, cacheControl = 'no-store') => {
        res.writeHead(code, { ...headers, 'Cache-Control': cacheControl });
        res.end(body === null ? undefined : JSON.stringify(body));
    };

    const path = (req.url || '').split('?')[0];
    if (req.method === 'OPTIONS') return send(204, null);
    if (req.method !== 'GET') return send(405, { status: 'unknown' });
    if (path !== '/live-status') return send(404, { status: 'unknown' });

    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
        return send(200, { status: cache.status, checkedAt: iso(cache.fetchedAt) }, 'public, max-age=15');
    }
    try {
        const status = await readAparat();
        cache = { status, fetchedAt: Date.now() };
        send(200, { status, checkedAt: iso(cache.fetchedAt) }, 'public, max-age=15');
    } catch (error) {
        console.error('Aparat live status check failed:', error.message);
        send(502, { status: 'unknown', checkedAt: iso(Date.now()) });
    }
});

if (import.meta.url === `file://${process.argv[1]}`) {
    server.listen(PORT, () => console.log(`live-status listening on :${PORT}`));
}
