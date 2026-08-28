import { waitUntil } from "cloudflare:workers";

export const SITEMAP_FRESH_CACHE_PATH = "/__dshx-cache/sitemap/fresh";
export const SITEMAP_STALE_CACHE_PATH = "/__dshx-cache/sitemap/stale";

export function sitemapCache(): Cache | null {
  return typeof caches === "undefined"
    ? null
    : (caches as CacheStorage & { default: Cache }).default;
}

export function sitemapCacheRequest(origin: string, path: string): Request {
  return new Request(new URL(path, origin), { method: "GET" });
}

export async function invalidateSitemapCache(origin = "https://dshx.io"): Promise<void> {
  const cache = sitemapCache();
  if (!cache) return;
  await cache.delete(sitemapCacheRequest(origin, SITEMAP_FRESH_CACHE_PATH));
}

export type CatalogChanged = {
  readonly type: "CatalogChanged";
  readonly origin: string;
};

export type BackgroundScheduler = (task: Promise<unknown>) => void;

export function catalogChanged(request: Request): CatalogChanged {
  return { type: "CatalogChanged", origin: new URL(request.url).origin };
}

export function publishCatalogChanged(
  event: CatalogChanged,
  schedule: BackgroundScheduler = waitUntil,
): void {
  schedule(invalidateSitemapCache(event.origin));
}
