import { describe, expect, it } from "vitest";

import { createTranslator, type Locale, messages } from "@/lib/i18n";

import { featuredShelfSlugs, orderFeaturedSections, withFeaturedShelfCopy } from "./featured";

describe("featured shelf copy", () => {
  it("overlays editorial copy for known category slugs", () => {
    const section = {
      slug: "ui",
      name: "UI Enhancements",
      description: "Database copy",
      plugins: [],
    };
    const t = createTranslator("zh");

    expect(withFeaturedShelfCopy(section, t)).toMatchObject({
      name: t("featured.shelf.ui.name"),
      description: t("featured.shelf.ui.description"),
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

    expect(withFeaturedShelfCopy(section, createTranslator("en"))).toBe(section);
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

  it("names every shelf in every locale", () => {
    const locales: readonly Locale[] = ["en", "zh"];
    for (const locale of locales) {
      for (const slug of featuredShelfSlugs) {
        expect(messages[locale][`featured.shelf.${slug}.name`]).toBeTruthy();
        expect(messages[locale][`featured.shelf.${slug}.description`]).toBeTruthy();
      }
    }
  });
});
