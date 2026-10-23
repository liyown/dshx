import { afterEach, describe, expect, it, vi } from "vitest";

import { invalidateBlogSitemap } from "./sitemap-invalidation.server";
import { SITEMAP_FRESH_CACHE_PATH, SITEMAP_STALE_CACHE_PATH } from "./sitemap-cache";

describe("blog sitemap invalidation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("clears both sitemap generations when an article changes", async () => {
    const deleted: string[] = [];
    const deleteEntry = vi.fn(async (request: Request) => {
      deleted.push(new URL(request.url).pathname);
      return true;
    });
    const schedule = vi.fn<(task: Promise<unknown>) => void>();
    vi.stubGlobal("caches", { default: { delete: deleteEntry } });

    invalidateBlogSitemap(new Request("https://dshx.io/api/admin/blog"), schedule);

    expect(schedule).toHaveBeenCalledOnce();
    await schedule.mock.calls[0]![0];
    expect(deleted).toEqual([SITEMAP_FRESH_CACHE_PATH, SITEMAP_STALE_CACHE_PATH]);
  });

  it("does nothing when the runtime has no Cache API", () => {
    const schedule = vi.fn<(task: Promise<unknown>) => void>();

    invalidateBlogSitemap(new Request("https://dshx.io/api/admin/blog"), schedule);

    expect(schedule).not.toHaveBeenCalled();
  });
});
