import { describe, expect, it } from "vitest";

import { featuredShelfCopy, orderFeaturedSections, withFeaturedShelfCopy } from "./featured";

describe("featured shelf copy", () => {
  it("overlays editorial copy for known category slugs", () => {
    const section = {
      slug: "ui",
      name: "UI Enhancements",
      description: "Database copy",
      plugins: [],
    };

    expect(withFeaturedShelfCopy(section, "zh")).toMatchObject({
      name: featuredShelfCopy.zh.ui.name,
      description: featuredShelfCopy.zh.ui.description,
      plugins: [],
    });
  });

  it("keeps unknown categories on their stored localization", () => {
    const section = {
      slug: "fixture-category",
      name: "Fixture category",
      description: "Stored copy",
      plugins: [],
    };

    expect(withFeaturedShelfCopy(section, "en")).toBe(section);
  });

  it("orders known shelves editorially and keeps unknown shelves last", () => {
    const sections = [
      { slug: "fun" },
      { slug: "unknown" },
      { slug: "ui" },
      { slug: "memory" },
      { slug: "remote" },
    ];

    expect(orderFeaturedSections(sections).map((section) => section.slug)).toEqual([
      "ui",
      "remote",
      "memory",
      "fun",
      "unknown",
    ]);
    expect(sections.map((section) => section.slug)).toEqual([
      "fun",
      "unknown",
      "ui",
      "memory",
      "remote",
    ]);
  });

  it("defines both locales for every shelf", () => {
    const enSlugs = Object.keys(featuredShelfCopy.en).sort();
    const zhSlugs = Object.keys(featuredShelfCopy.zh).sort();

    expect(zhSlugs).toEqual(enSlugs);
    for (const slug of enSlugs) {
      expect(featuredShelfCopy.en[slug as keyof typeof featuredShelfCopy.en].name).toBeTruthy();
      expect(featuredShelfCopy.zh[slug as keyof typeof featuredShelfCopy.zh].name).toBeTruthy();
    }
  });
});
