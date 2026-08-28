import { describe, expect, it } from "vitest";

import {
  breadcrumbList,
  buildSeoHead,
  localizedAlternates,
  localizedAlternatesForLocales,
  normalizePublicPath,
  publicUrl,
} from "./seo";

describe("SEO document builder", () => {
  it("normalizes canonical paths without changing the root", () => {
    expect(normalizePublicPath("/")).toBe("/");
    expect(normalizePublicPath("en/plugins/")).toBe("/en/plugins");
    expect(publicUrl("/zh/docs/")).toBe("https://dshx.io/zh/docs");
    expect(publicUrl("/en/plugins/?sort=stars#results")).toBe("https://dshx.io/en/plugins");
  });

  it("only advertises reciprocal dynamic alternates when both locales are indexable", () => {
    expect(localizedAlternatesForLocales("/plugins/example", ["en"])).toBe(false);
    expect(localizedAlternatesForLocales("/plugins/example", ["zh", "en"])).toEqual(
      localizedAlternates("/plugins/example"),
    );
  });

  it("emits one canonical and a complete reciprocal locale set", () => {
    const head = buildSeoHead({
      locale: "en",
      path: "/en/plugins",
      title: "Plugins",
      description: "Published DSH plugins.",
      alternates: localizedAlternates("/plugins"),
    });

    expect(head.links).toContainEqual({
      rel: "canonical",
      href: "https://dshx.io/en/plugins",
    });
    expect(head.links.filter((link) => link["rel"] === "alternate")).toEqual([
      { rel: "alternate", hrefLang: "en", href: "https://dshx.io/en/plugins" },
      { rel: "alternate", hrefLang: "zh", href: "https://dshx.io/zh/plugins" },
      { rel: "alternate", hrefLang: "x-default", href: "https://dshx.io/en/plugins" },
    ]);
  });

  it("wraps structured data in one schema graph", () => {
    const head = buildSeoHead({
      locale: "zh",
      path: "/zh",
      title: "DSHX",
      description: "DSHX",
      structuredData: [{ "@type": "WebSite", name: "DSHX" }],
    });
    expect(JSON.parse(head.scripts[0]!.children)).toMatchObject({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "WebSite", name: "DSHX" }],
    });
  });

  it("gives breadcrumb graphs a stable page-scoped identifier", () => {
    expect(
      breadcrumbList([
        { name: "DSHX", path: "/en" },
        { name: "Docs", path: "/en/docs" },
      ]),
    ).toMatchObject({ "@id": "https://dshx.io/en/docs#breadcrumbs" });
  });
});
