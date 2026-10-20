import { waitUntil } from "cloudflare:workers";

import {
  sitemapCache,
  sitemapCacheRequest,
  SITEMAP_FRESH_CACHE_PATH,
  SITEMAP_STALE_CACHE_PATH,
} from "@/lib/sitemap-cache";

/**
 * Blog publication changes the dynamic sitemap entries. Both the admin editor
 * and the bearer-token Operations API mutate through the same repository, so
 * both paths must invalidate the cached sitemap.
 */
export function invalidateBlogSitemap(
  request: Request,
  schedule: (task: Promise<unknown>) => void = waitUntil,
): void {
  const cache = sitemapCache();
  if (!cache) return;
  const origin = new URL(request.url).origin;
  schedule(
    Promise.all([
      cache.delete(sitemapCacheRequest(origin, SITEMAP_FRESH_CACHE_PATH)),
      cache.delete(sitemapCacheRequest(origin, SITEMAP_STALE_CACHE_PATH)),
    ]).catch((error: unknown) => console.error("Blog sitemap invalidation failed", error)),
  );
}
