import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "cloudflare:workers";

import { requireDatabase } from "@/lib/db/client";
import type { AppRequestContext } from "@/lib/db/context";
import { PUBLIC_SITE_URL } from "@/lib/seo";
import { conditionalSitemapResponse } from "@/lib/sitemap";
import { buildCurrentSitemap } from "@/lib/sitemap.application.server";
import {
  SITEMAP_FRESH_CACHE_PATH,
  SITEMAP_STALE_CACHE_PATH,
  type BackgroundScheduler,
  sitemapCache,
  sitemapCacheRequest,
} from "@/lib/sitemap-cache";

function storedResponse(response: Response, maxAge: number): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", `public, max-age=${maxAge}`);
  return new Response(response.body, { status: response.status, headers });
}

async function cachedSitemap(cache: Cache | null, request: Request, path: string) {
  if (!cache) return null;
  const response = await cache.match(sitemapCacheRequest(new URL(request.url).origin, path));
  return response ? conditionalSitemapResponse(request, response) : null;
}

export async function generateSitemap(
  _request: Request,
  context: AppRequestContext,
): Promise<Response> {
  const db = requireDatabase(context);
  return buildCurrentSitemap(db, PUBLIC_SITE_URL);
}

async function writeSitemapCache(
  cache: Cache,
  request: Request,
  generated: Response,
): Promise<void> {
  const origin = new URL(request.url).origin;
  await Promise.all([
    cache.put(
      sitemapCacheRequest(origin, SITEMAP_FRESH_CACHE_PATH),
      storedResponse(generated.clone(), 21_600),
    ),
    cache.put(
      sitemapCacheRequest(origin, SITEMAP_STALE_CACHE_PATH),
      storedResponse(generated.clone(), 108_000),
    ),
  ]);
}

async function refreshSitemap(
  cache: Cache,
  request: Request,
  context: AppRequestContext,
): Promise<void> {
  const generated = await generateSitemap(request, context);
  await writeSitemapCache(cache, request, generated);
}

export async function serveSitemap(
  request: Request,
  appContext: AppRequestContext,
  cache = sitemapCache(),
  schedule: BackgroundScheduler = waitUntil,
): Promise<Response> {
  const fresh = await cachedSitemap(cache, request, SITEMAP_FRESH_CACHE_PATH);
  if (fresh) return fresh;

  const stale = await cachedSitemap(cache, request, SITEMAP_STALE_CACHE_PATH);
  if (stale && cache) {
    const refresh = refreshSitemap(cache, request, appContext).catch((error: unknown) => {
      console.error(error);
    });
    schedule(refresh);
    const headers = new Headers(stale.headers);
    headers.set("x-sitemap-cache", "stale-while-revalidate");
    return new Response(stale.body, { status: stale.status, headers });
  }

  try {
    const generated = await generateSitemap(request, appContext);
    if (cache) {
      const cacheWrites = writeSitemapCache(cache, request, generated.clone());
      schedule(cacheWrites);
    }
    return conditionalSitemapResponse(request, generated);
  } catch (error) {
    console.error(error);
    return new Response("Sitemap is temporarily unavailable.", {
      status: 503,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "retry-after": "60",
      },
    });
  }
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const appContext = context as unknown as AppRequestContext;
        return serveSitemap(request, appContext);
      },
    },
  },
});
