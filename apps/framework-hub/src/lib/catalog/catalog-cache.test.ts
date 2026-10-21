import { afterEach, describe, expect, it, vi } from "vitest";

import { catalogListCacheKey, withCatalogCache } from "./catalog-cache.server";
import { cacheRequest, storeCached } from "@/lib/page-cache";

type MemoryCache = Cache & { entries: Map<string, Response> };

function memoryCache(): MemoryCache {
  const entries = new Map<string, Response>();
  return {
    entries,
    match: async (request: Request) => entries.get(new Request(request).url)?.clone(),
    put: async (request: Request, response: Response) => {
      entries.set(new Request(request).url, response.clone());
    },
    delete: async (request: Request) => entries.delete(new Request(request).url),
  } as unknown as MemoryCache;
}

const query = {
  locale: "en" as const,
  q: "",
  category: null,
  sort: "featured" as const,
  cursor: null,
  limit: 24,
};

afterEach(() => vi.unstubAllGlobals());

describe("catalog list cache", () => {
  it("keys on every input that changes the page", () => {
    expect(catalogListCacheKey(query)).toBe(catalogListCacheKey({ ...query }));
    expect(catalogListCacheKey(query)).not.toBe(catalogListCacheKey({ ...query, sort: "stars" }));
    expect(catalogListCacheKey(query)).not.toBe(catalogListCacheKey({ ...query, q: "vite" }));
    expect(catalogListCacheKey(query)).not.toBe(catalogListCacheKey({ ...query, limit: 6 }));
  });

  it("runs the query every time when no edge cache is available", async () => {
    const produce = vi.fn(async () => ({ total: 1 }));

    await withCatalogCache("/data/catalog/test", produce);
    await withCatalogCache("/data/catalog/test", produce);

    expect(produce).toHaveBeenCalledTimes(2);
  });

  it("answers repeat requests from cache", async () => {
    const cache = memoryCache();
    vi.stubGlobal("caches", { default: cache });
    const produce = vi.fn(async () => ({ total: 7 }));

    expect(await withCatalogCache("/data/catalog/test", produce)).toEqual({ total: 7 });
    await vi.waitFor(() => expect(cache.entries.size).toBe(2));

    expect(await withCatalogCache("/data/catalog/test", produce)).toEqual({ total: 7 });
    expect(produce).toHaveBeenCalledOnce();
  });

  it("serves a stale entry while refreshing it in the background", async () => {
    const cache = memoryCache();
    vi.stubGlobal("caches", { default: cache });
    const key = "/data/catalog/test";
    await storeCached(cache, key, Response.json({ total: 1 }));
    // Drop only the fresh slot so the next read has to fall back to stale.
    await cache.delete(cacheRequest(key, "fresh"));

    const produce = vi.fn(async () => ({ total: 2 }));

    expect(await withCatalogCache(key, produce)).toEqual({ total: 1 });
    await vi.waitFor(async () => {
      const refreshed = await cache.match(cacheRequest(key, "fresh"));
      expect(await refreshed?.json()).toEqual({ total: 2 });
    });
  });
});
