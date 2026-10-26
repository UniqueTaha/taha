var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// live-status-worker.js
var APARAT_STATUS_URL = "https://www.aparat.com/api/fa/v2/Live/LiveStream/show/username/uniquetaha";
var ALLOWED_ORIGINS = /* @__PURE__ */ new Set([
  "https://uniquetaha.ir",
  "https://www.uniquetaha.ir"
]);
var CACHE_KEY = new Request("https://live-status-cache.uniquetaha.ir/status");
function corsHeaders(origin) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Vary": "Origin"
  });
  if (ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Accept");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return headers;
}
__name(corsHeaders, "corsHeaders");
function jsonResponse(body, status, origin, cacheControl = "no-store") {
  const headers = corsHeaders(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", cacheControl);
  return new Response(JSON.stringify(body), { status, headers });
}
__name(jsonResponse, "jsonResponse");
var live_status_worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "GET") {
      return jsonResponse({ status: "unknown" }, 405, origin);
    }
    if (url.pathname !== "/live-status") {
      return jsonResponse({ status: "unknown" }, 404, origin);
    }
    try {
      const cached = await caches.default.match(CACHE_KEY);
      if (cached) {
        return jsonResponse(
          await cached.json(),
          cached.status,
          origin,
          cached.headers.get("Cache-Control") || "no-store"
        );
      }
      const response = await fetch(APARAT_STATUS_URL, {
        headers: {
          Accept: "application/json",
          "User-Agent": "UniqueTahaLiveStatus/1.0 (+https://uniquetaha.ir)",
          Referer: "https://www.aparat.com/uniquetaha/live"
        },
        signal: AbortSignal.timeout(8e3)
      });
      if (!response.ok) {
        throw new Error(`Aparat returned HTTP ${response.status}`);
      }
      const data = await response.json();
      const candidates = [
        data?.live_status?.type,
        data?.live_status?.status,
        data?.live_type,
        data?.liveStatus?.type,
        data?.status,
        data?.result?.live_status?.type,
        data?.result?.live_type
      ];
      const aparatStatus = candidates.find((value) => typeof value === "string")?.toLowerCase();
      let status;
      if (aparatStatus === "live") {
        status = "live";
      } else if (["nolive", "end", "offline", "notlive", "not_live"].includes(aparatStatus)) {
        status = "offline";
      } else {
        throw new Error("Aparat returned an unrecognized live status");
      }
      const result = jsonResponse(
        { status, checkedAt: (/* @__PURE__ */ new Date()).toISOString() },
        200,
        origin,
        "public, max-age=30, s-maxage=30"
      );
      ctx.waitUntil(caches.default.put(CACHE_KEY, result.clone()));
      return result;
    } catch (error) {
      console.error("Aparat live status check failed:", error);
      return jsonResponse(
        { status: "unknown", checkedAt: (/* @__PURE__ */ new Date()).toISOString() },
        502,
        origin
      );
    }
  }
};
export {
  live_status_worker_default as default
};
//# sourceMappingURL=live-status-worker.js.map
