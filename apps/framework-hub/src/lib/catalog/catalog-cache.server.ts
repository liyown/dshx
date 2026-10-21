import { waitUntil } from "cloudflare:workers";

import { publicCache, readCached, storeCached } from "@/lib/page-cache";

import type { PluginListQuery } from "./contracts";
import type { CatalogCard } from "./types";

/**
 * Caches public catalog list responses in the edge cache.
 *
 * The list query scores every published plugin on each request, so the same
 * page is answered from cache for a short window instead of re-running that
 * work for every visitor and every client-side navigation.
 */
export type CachedCatalogList = {
  items: CatalogCard[];
  nextCursor: string | null;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  categories: { slug: string; name: string }[];
};

type CatalogListCacheKey = Pick<
  PluginListQuery,
  "locale" | "q" | "category" | "sort" | "cursor" | "limit"
>;

export function catalogListCacheKey(query: CatalogListCacheKey): string {
  const parts = [
    query.locale,
    query.sort,
    query.category ?? "",
    query.cursor ?? "",
    String(query.limit),
    query.q,
  ];
  return `/data/catalog/list/${encodeURIComponent(parts.join("|"))}`;
}

export async function withCatalogCache<T>(key: string, produce: () => Promise<T>): Promise<T> {
  const cache = publicCache();
  if (!cache) return produce();

  try {
    const fresh = await readCached(cache, key, "fresh");
    if (fresh) return (await fresh.json()) as T;

    const stale = await readCached(cache, key, "stale");
    if (stale) {
      waitUntil(refreshCatalogCache(cache, key, produce));
      return (await stale.json()) as T;
    }
  } catch (error) {
    logCacheError(error);
  }

  const value = await produce();
  waitUntil(storeCatalogCache(cache, key, value));
  return value;
}

async function refreshCatalogCache<T>(
  cache: Cache,
  key: string,
  produce: () => Promise<T>,
): Promise<void> {
  try {
    await storeCatalogCache(cache, key, await produce());
  } catch (error) {
    logCacheError(error);
  }
}

async function storeCatalogCache<T>(cache: Cache, key: string, value: T): Promise<void> {
  try {
    await storeCached(cache, key, Response.json(value));
  } catch (error) {
    logCacheError(error);
  }
}

function logCacheError(error: unknown): void {
  console.error("Catalog cache operation failed", error);
}
