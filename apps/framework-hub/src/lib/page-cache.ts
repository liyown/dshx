/**
 * Edge cache primitives for public pages and catalog responses.
 *
 * A Worker response is not cached by Cloudflare on its own: `cache-control`
 * only describes it to downstream caches, so every visit re-renders and
 * re-queries D1. These helpers keep a fresh/stale pair in `caches.default`,
 * the same shape the sitemap already uses, so a cached public page can be
 * served without rendering or touching the database.
 *
 * Only public, cookie-free, HTML responses are ever stored; authenticated and
 * state-changing traffic always bypasses the cache.
 */
const CACHE_ORIGIN = "https://cache.dshx.io";
const CACHE_PREFIX = "/__dshx-cache";

/** How long a stored entry is served without a background refresh. */
export const PAGE_CACHE_FRESH_SECONDS = 60;
/** How long a stale entry may still be served while a refresh runs. */
export const PAGE_CACHE_STALE_SECONDS = 600;

/** Browser-facing policy for cacheable public pages. */
export const PUBLIC_PAGE_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";

export type CacheSlot = "fresh" | "stale";
export type PageCacheStatus = "fresh" | "stale" | "miss";

export function publicCache(): Cache | null {
  if (typeof caches === "undefined") return null;
  return (caches as CacheStorage & { default?: Cache }).default ?? null;
}

export function cacheRequest(key: string, slot: CacheSlot): Request {
  return new Request(new URL(`${CACHE_PREFIX}/${slot}${key}`, CACHE_ORIGIN), { method: "GET" });
}

export async function readCached(
  cache: Cache,
  key: string,
  slot: CacheSlot,
): Promise<Response | null> {
  const cached = await cache.match(cacheRequest(key, slot));
  return cached ?? null;
}

/** Stores the response in both slots, each with its own Cache-API lifetime. */
export async function storeCached(cache: Cache, key: string, response: Response): Promise<void> {
  await Promise.all([
    writeSlot(cache, key, "fresh", response.clone(), PAGE_CACHE_FRESH_SECONDS),
    writeSlot(cache, key, "stale", response.clone(), PAGE_CACHE_STALE_SECONDS),
  ]);
}

async function writeSlot(
  cache: Cache,
  key: string,
  slot: CacheSlot,
  response: Response,
  maxAgeSeconds: number,
): Promise<void> {
  const headers = new Headers(response.headers);
  // Cache-API lifetime comes from the stored max-age; the browser-facing
  // policy is restored whenever the entry is served.
  headers.set("cache-control", `public, max-age=${maxAgeSeconds}`);
  await cache.put(
    cacheRequest(key, slot),
    new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
}

/** Copies a cached response while exposing which slot answered the request. */
export function withCacheStatus(response: Response, status: PageCacheStatus): Response {
  const headers = new Headers(response.headers);
  headers.set("x-dshx-page-cache", status);
  if (status !== "miss") headers.set("cache-control", PUBLIC_PAGE_CACHE_CONTROL);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
