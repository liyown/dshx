import { describe, expect, it } from "vitest";

import {
  buildPageHead,
  localePath,
  localizedAlternates,
  localizedAlternatesForLocales,
  normalizePublicPath,
  pageTitle,
  publicUrl,
  socialCardUrl,
} from "./index";

describe("public URLs", () => {
  it("normalizes canonical paths without changing the root", () => {
    expect(normalizePublicPath("/")).toBe("/");
    expect(normalizePublicPath("en/plugins/")).toBe("/en/plugins");
    expect(publicUrl("/zh/docs/")).toBe("https://dshx.io/zh/docs");
    expect(publicUrl("/en/plugins/?sort=stars#results")).toBe("https://dshx.io/en/plugins");
  });

  it("prefixes a locale-relative path with its locale exactly once", () => {
    expect(localePath("en", "/")).toBe("/en");
    expect(localePath("zh", "/plugins/example")).toBe("/zh/plugins/example");
    expect(localePath("en", "/en/plugins")).toBe("/en/en/plugins");
  });

  it("only advertises reciprocal dynamic alternates when both locales are indexable", () => {
    expect(localizedAlternatesForLocales("/plugins/example", ["en"])).toBe(false);
    expect(localizedAlternatesForLocales("/plugins/example", ["zh", "en"])).toEqual(
      localizedAlternates("/plugins/example"),
    );
  });

  it("gives social cards stable revisioned URLs", () => {
    const first = socialCardUrl("/og/home/en/card.png", "0.1.2", "Build plugins");
    expect(first).toMatch(/^https:\/\/dshx\.io\/og\/home\/en\/card\.png\?v=[a-z0-9]+$/);
    expect(socialCardUrl("/og/home/en/card.png", "0.1.2", "Build plugins")).toBe(first);
    expect(socialCardUrl("/og/home/en/card.png", "0.1.2", "Changed copy")).not.toBe(first);
  });
});

describe("page head", () => {
  it("builds a title in the site's convention", () => {
    expect(pageTitle("Plugins")).toBe("Plugins · DSHX");
    expect(pageTitle("Policy", "DSHX Hub")).toBe("Policy · DSHX Hub");
  });

  it("emits one canonical and a complete reciprocal locale set", () => {
    const head = buildPageHead({
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
    const head = buildPageHead({
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

  it("escapes markup in the graph so a title can never close the script", () => {
    const head = buildPageHead({
      locale: "en",
      path: "/en",
      title: "DSHX",
      description: "DSHX",
      structuredData: [{ "@type": "Thing", name: "</script><script>" }],
    });
    expect(head.scripts[0]!.children).not.toContain("</script>");
  });

  it("emits complete Open Graph and X image metadata", () => {
    const head = buildPageHead({
      locale: "en",
      path: "/en",
      title: "DSHX",
      description: "Build plugins.",
      image: {
        url: "https://dshx.io/og/home/en/card.png?v=1",
        alt: "DSHX social card",
        width: 1200,
        height: 630,
        type: "image/png",
      },
    });
    expect(head.meta).toEqual(
      expect.arrayContaining([
        { property: "og:image:type", content: "image/png" },
        { name: "twitter:image:alt", content: "DSHX social card" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
      ]),
    );
  });

  it("marks a page without an image as a summary card", () => {
    const head = buildPageHead({
      locale: "en",
      path: "/en/operations/unknown",
      title: "Not found",
      description: "Not found",
      image: false,
    });
    expect(head.meta).toContainEqual({ name: "twitter:card", content: "summary" });
    expect(head.meta.some((entry) => entry["property"] === "og:image")).toBe(false);
  });
});
