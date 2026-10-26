<?php
// Unique Taha - Aparat live status proxy. Upload to an IRAN-based host (Aparat only answers from Iran).
// Public result: {"status":"live"|"offline","checkedAt":"..."}  (on any error: HTTP 502 {"status":"unknown"})

const APARAT_URL = 'https://www.aparat.com/api/fa/v2/Live/LiveStream/show/username/uniquetaha';
const CACHE_TTL  = 30; // seconds
const ALLOWED_ORIGINS = ['https://uniquetaha.ir', 'https://www.uniquetaha.ir'];

$cacheFile = __DIR__ . '/live-status.cache.json';
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

header('Content-Type: application/json; charset=utf-8');
header('Vary: Origin');
if (in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: GET, OPTIONS');
    header('Access-Control-Allow-Headers: Accept');
    header('Access-Control-Max-Age: 86400');
}

if ($method === 'OPTIONS') { http_response_code(204); exit; }
if ($method !== 'GET')     { http_response_code(405); header('Cache-Control: no-store'); echo '{"status":"unknown"}'; exit; }

function reply($status, $fetchedAt) {
    header('Cache-Control: public, max-age=15');
    echo json_encode(array('status' => $status, 'checkedAt' => gmdate('Y-m-d\TH:i:s\Z', $fetchedAt)));
    exit;
}

// 1) fresh cache?
$raw = @file_get_contents($cacheFile);
if ($raw !== false) {
    $c = json_decode($raw, true);
    if (is_array($c) && isset($c['status'], $c['fetchedAt'])
        && ($c['status'] === 'live' || $c['status'] === 'offline')
        && (time() - (int)$c['fetchedAt']) < CACHE_TTL) {
        reply($c['status'], (int)$c['fetchedAt']);
    }
}

// 2) ask Aparat
function fetch_aparat() {
    $headers = array(
        'Accept: application/json',
        'User-Agent: UniqueTahaLiveStatus/1.0 (+https://uniquetaha.ir)',
        'Referer: https://www.aparat.com/uniquetaha/live'
    );
    if (function_exists('curl_init')) {
        $ch = curl_init(APARAT_URL);
        curl_setopt_array($ch, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_FOLLOWLOCATION => false,
        ));
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ($body !== false && $code === 200) ? $body : false;
    }
    $ctx = stream_context_create(array('http' => array('method' => 'GET', 'timeout' => 8, 'header' => implode("\r\n", $headers))));
    $body = @file_get_contents(APARAT_URL, false, $ctx);
    return $body;
}

$body = fetch_aparat();
$data = ($body !== false) ? json_decode($body, true) : null;
$candidates = array(
    is_array($data) && isset($data['live_status']['type']) ? strtolower((string)$data['live_status']['type']) : null,
    is_array($data) && isset($data['live_status']['status']) ? strtolower((string)$data['live_status']['status']) : null,
    is_array($data) && isset($data['live_type']) ? strtolower((string)$data['live_type']) : null,
    is_array($data) && isset($data['liveStatus']['type']) ? strtolower((string)$data['liveStatus']['type']) : null,
    is_array($data) && isset($data['status']) ? strtolower((string)$data['status']) : null,
    is_array($data) && isset($data['result']['live_status']['type']) ? strtolower((string)$data['result']['live_status']['type']) : null,
    is_array($data) && isset($data['result']['live_type']) ? strtolower((string)$data['result']['live_type']) : null,
);
$type = null;
foreach ($candidates as $candidate) {
    if (is_string($candidate) && $candidate !== '') {
        $type = $candidate;
        break;
    }
}

if ($type === 'live') {
    $status = 'live';
} elseif (in_array($type, array('nolive', 'end', 'offline', 'notlive', 'not_live'), true)) {
    $status = 'offline';
} else {
    // error / blocked / changed API: never claim "offline"
    http_response_code(502);
    header('Cache-Control: no-store');
    echo json_encode(array('status' => 'unknown', 'checkedAt' => gmdate('Y-m-d\TH:i:s\Z')));
    exit;
}

$now = time();
@file_put_contents($cacheFile, json_encode(array('status' => $status, 'fetchedAt' => $now)), LOCK_EX);
reply($status, $now);
