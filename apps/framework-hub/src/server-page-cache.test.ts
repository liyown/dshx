import { afterEach, describe, expect, it, vi } from "vitest";

const renders = vi.hoisted(() => ({ count: 0 }));

vi.mock("@tanstack/react-start/server-entry", () => ({
  createServerEntry: <T>(entry: T) => entry,
  default: {
    fetch: vi.fn(async (request: Request) => {
      renders.count += 1;
      return new Response(`<html><body>${new URL(request.url).pathname}</body></html>`, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
        },
      });
    }),
  },
}));

import { isPageCacheable, default as server } from "./server";
import { PUBLIC_PAGE_CACHE_CONTROL } from "./lib/page-cache";

const worker = server as {
  fetch(request: Request, env: unknown, context: unknown): Promise<Response>;
};

type MemoryCache = Cache & { entries: Map<string, Response> };

function memoryCache(): MemoryCache {
  const entries = new Map<string, Response>();
  return {
    entries,
    match: async (request: Request) => entries.get(new Request(request).url)?.clone(),
    put: async (request: Request, response: Response) => {
      entries.set(new Request(request).url, response.clone());
    },
    delete: async () => true,
  } as unknown as MemoryCache;
}

function fetchPage(url: string, headers: Record<string, string> = {}) {
  return worker.fetch(new Request(url, { headers: { accept: "text/html", ...headers } }), {}, {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  renders.count = 0;
});

describe("public page cache", () => {
  it("keeps personalized and negotiated requests off the cache", () => {
    expect(isPageCacheable(new Request("https://dshx.io/en/plugins"))).toBe(true);
    expect(isPageCacheable(new Request("https://dshx.io/en"))).toBe(true);
    expect(isPageCacheable(new Request("https://dshx.io/en/categories/data"))).toBe(true);

    expect(
      isPageCacheable(new Request("https://dshx.io/en/plugins", { headers: { cookie: "a=b" } })),
    ).toBe(false);
    expect(
      isPageCacheable(
        new Request("https://dshx.io/en/plugins", { headers: { authorization: "Bearer t" } }),
      ),
    ).toBe(false);
    expect(
      isPageCacheable(new Request("https://dshx.io/en", { headers: { accept: "text/markdown" } })),
    ).toBe(false);
    expect(isPageCacheable(new Request("https://dshx.io/en/plugins?q=vite"))).toBe(false);
    expect(isPageCacheable(new Request("https://dshx.io/en/plugins?cursor=abc"))).toBe(false);
    expect(isPageCacheable(new Request("https://dshx.io/en/plugins/some-plugin"))).toBe(false);
    expect(isPageCacheable(new Request("https://dshx.io/en/blog"))).toBe(false);
  });

  it("serves the second visit from cache without rendering again", async () => {
    const cache = memoryCache();
    vi.stubGlobal("caches", { default: cache });

    const first = await fetchPage("https://dshx.io/en/plugins?sort=stars");
    expect(first.status).toBe(200);
    expect(first.headers.get("x-dshx-page-cache")).toBe("miss");
    expect(renders.count).toBe(1);

    await vi.waitFor(() => expect(cache.entries.size).toBe(2));

    const second = await fetchPage("https://dshx.io/en/plugins?sort=stars&");
    expect(second.headers.get("x-dshx-page-cache")).toBe("fresh");
    expect(second.headers.get("cache-control")).toBe(PUBLIC_PAGE_CACHE_CONTROL);
    expect(await second.text()).toContain("/en/plugins");
    expect(renders.count).toBe(1);
  });

  it("never caches a request that carries a session cookie", async () => {
    const cache = memoryCache();
    vi.stubGlobal("caches", { default: cache });

    await fetchPage("https://dshx.io/en", { cookie: "session=1" });
    await fetchPage("https://dshx.io/en", { cookie: "session=1" });

    expect(renders.count).toBe(2);
    expect(cache.entries.size).toBe(0);
  });

  it("re-renders search pages instead of caching them", async () => {
    const cache = memoryCache();
    vi.stubGlobal("caches", { default: cache });

    await fetchPage("https://dshx.io/en/plugins?q=vite");
    const second = await fetchPage("https://dshx.io/en/plugins?q=vite");

    expect(second.headers.get("x-dshx-page-cache")).toBeNull();
    expect(renders.count).toBe(2);
    expect(cache.entries.size).toBe(0);
  });
});
