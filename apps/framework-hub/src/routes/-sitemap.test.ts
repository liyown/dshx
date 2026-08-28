import { describe, expect, it, vi } from "vitest";

import type { AppRequestContext } from "@/lib/db/context";
import { responseForSitemap } from "@/lib/sitemap";
import { SITEMAP_FRESH_CACHE_PATH, SITEMAP_STALE_CACHE_PATH } from "@/lib/sitemap-cache";
import { serveSitemap } from "./sitemap[.]xml";

function cacheWith(entries: Readonly<Record<string, Response>>): Cache {
  return {
    match: vi.fn(async (request: RequestInfo | URL) => {
      const pathname = new URL(request instanceof Request ? request.url : String(request)).pathname;
      return entries[pathname]?.clone();
    }),
    put: vi.fn(async () => undefined),
  } as unknown as Cache;
}

const request = new Request("https://dshx.io/sitemap.xml");

describe("sitemap edge delivery", () => {
  it("returns a fresh cache hit without touching D1", async () => {
    const fresh = responseForSitemap("<urlset></urlset>", '"fresh"');
    const context = { cloudflare: {} } as AppRequestContext;
    const response = await serveSitemap(
      request,
      context,
      cacheWith({ [SITEMAP_FRESH_CACHE_PATH]: fresh }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"fresh"');
  });

  it("serves stale XML when regeneration cannot use D1", async () => {
    const stale = responseForSitemap("<urlset></urlset>", '"stale"');
    const context = { cloudflare: {} } as AppRequestContext;
    const pending: Promise<unknown>[] = [];
    const response = await serveSitemap(
      request,
      context,
      cacheWith({ [SITEMAP_STALE_CACHE_PATH]: stale }),
      (task) => pending.push(task),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-sitemap-cache")).toBe("stale-while-revalidate");
    expect(response.headers.get("etag")).toBe('"stale"');
    await Promise.all(pending);
  });
});
