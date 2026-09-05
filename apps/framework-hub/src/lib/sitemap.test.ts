import { describe, expect, it } from "vitest";

import {
  buildSitemapXml,
  conditionalSitemapResponse,
  createSitemapEntries,
  responseForSitemap,
} from "./sitemap";

describe("single dynamic sitemap", () => {
  it("keeps one canonical urlset with static and dynamic entries", () => {
    const entries = createSitemapEntries("https://dshx.io/", [
      { kind: "plugin", locale: "en", value: "hello-plugin", updated_at: 1_700_000_000_000 },
      { kind: "plugin", locale: "en", value: "hello-plugin", updated_at: 1_700_000_000_000 },
      { kind: "category", locale: "zh", value: "tools", updated_at: null },
    ]);
    const { xml, warnings } = buildSitemapXml(entries);

    expect(warnings).toEqual([]);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("https://dshx.io/en/about");
    expect(xml).toContain("https://dshx.io/en/docs/architecture");
    expect(xml).toContain("https://dshx.io/en/plugins/hello-plugin");
    expect(xml.match(/hello-plugin/g)).toHaveLength(1);
    expect(xml).not.toContain("<sitemapindex");
  });

  it("returns 304 for a matching sitemap etag", () => {
    const response = responseForSitemap("<xml />", '"etag"');
    const conditional = conditionalSitemapResponse(
      new Request("https://dshx.io/sitemap.xml", { headers: { "if-none-match": '"etag"' } }),
      response,
    );
    expect(conditional.status).toBe(304);
  });

  it("includes changelog records supplied by D1 with their stored lastmod", () => {
    const modified = 1_700_000_000_000;
    const entries = createSitemapEntries("https://dshx.io", [
      { kind: "changelog", locale: "en", value: "database-release", updated_at: modified },
      { kind: "changelog", locale: "zh", value: "database-release", updated_at: modified },
    ]);
    for (const locale of ["en", "zh"]) {
      expect(entries.some((entry) => entry.loc === `https://dshx.io/${locale}/changelog`)).toBe(
        true,
      );
      expect(entries).toContainEqual({
        loc: `https://dshx.io/${locale}/changelog/database-release`,
        kind: "changelog",
        locale,
        lastmod: new Date(modified).toISOString(),
      });
    }
    expect(
      createSitemapEntries("https://dshx.io", []).filter((entry) => entry.kind === "changelog"),
    ).toEqual([]);
  });

  it("omits invalid and future lastmod values", () => {
    const entries = createSitemapEntries("https://dshx.io", [
      {
        kind: "plugin",
        locale: "en",
        value: "future-plugin",
        updated_at: Date.now() + 86_400_000,
      },
    ]);
    expect(entries.find((entry) => entry.loc.endsWith("/future-plugin"))?.lastmod).toBeUndefined();
  });
});
