import { waitUntil } from "cloudflare:workers";

import {
  sitemapCache,
  sitemapCacheRequest,
  SITEMAP_FRESH_CACHE_PATH,
  SITEMAP_STALE_CACHE_PATH,
} from "@/lib/sitemap-cache";

/**
 * Publishing content changes the dynamic sitemap entries. Every path that
 * mutates through a content repository — the admin editor and the bearer-token
 * Operations API — must invalidate the cached sitemap, so both call one of the
 * named functions below rather than the cache directly.
 */
export function invalidateBlogSitemap(
  request: Request,
  schedule: (task: Promise<unknown>) => void = waitUntil,
): void {
  invalidateSitemap(request, "Blog", schedule);
}

export function invalidateChangelogSitemap(
  request: Request,
  schedule: (task: Promise<unknown>) => void = waitUntil,
): void {
  invalidateSitemap(request, "Changelog", schedule);
}

function invalidateSitemap(
  request: Request,
  label: string,
  schedule: (task: Promise<unknown>) => void,
): void {
  const cache = sitemapCache();
  if (!cache) return;
  const origin = new URL(request.url).origin;
  schedule(
    Promise.all([
      cache.delete(sitemapCacheRequest(origin, SITEMAP_FRESH_CACHE_PATH)),
      cache.delete(sitemapCacheRequest(origin, SITEMAP_STALE_CACHE_PATH)),
    ]).catch((error: unknown) => console.error(`${label} sitemap invalidation failed`, error)),
  );
}
