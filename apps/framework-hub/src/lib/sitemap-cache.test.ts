import { afterEach, describe, expect, it, vi } from "vitest";

import {
  catalogChanged,
  invalidateSitemapCache,
  publishCatalogChanged,
  SITEMAP_FRESH_CACHE_PATH,
} from "./sitemap-cache";

describe("sitemap invalidation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("removes the fresh cache entry after a catalog mutation", async () => {
    const deleted: Request[] = [];
    const deleteEntry = vi.fn(async (request: Request) => {
      deleted.push(request);
      return true;
    });
    vi.stubGlobal("caches", { default: { delete: deleteEntry } });

    await invalidateSitemapCache("https://dshx.io");

    expect(deleteEntry).toHaveBeenCalledOnce();
    expect(new URL(deleted[0]!.url).pathname).toBe(SITEMAP_FRESH_CACHE_PATH);
  });

  it("attaches invalidation to the Worker lifetime", async () => {
    const deleteEntry = vi.fn(async () => true);
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    vi.stubGlobal("caches", { default: { delete: deleteEntry } });

    publishCatalogChanged(
      catalogChanged(new Request("https://dshx.io/api/ops/v1/plugins/plugin-id/curation")),
      waitUntil,
    );

    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0]![0];
    expect(deleteEntry).toHaveBeenCalledOnce();
  });
});
