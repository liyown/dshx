import { describe, expect, it } from "vitest";

import {
  article,
  breadcrumbs,
  collection,
  faqPage,
  organization,
  pluginApplication,
  profilePage,
} from "./index";

describe("schema.org vocabulary", () => {
  it("gives the organization one identity that every graph can reference", () => {
    expect(organization()).toMatchObject({
      "@id": "https://dshx.io/#organization",
      "@type": "Organization",
      name: "DSHX",
      url: "https://dshx.io",
    });
  });

  it("starts every breadcrumb trail at the home page", () => {
    const trail = breadcrumbs("zh", [
      { name: "插件市场", to: "/plugins" },
      { name: "Example", to: "/plugins/example" },
    ]);
    expect(trail).toMatchObject({ "@id": "https://dshx.io/zh/plugins/example#breadcrumbs" });
    expect(trail["itemListElement"]).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "DSHX",
        item: "https://dshx.io/zh",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "插件市场",
        item: "https://dshx.io/zh/plugins",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Example",
        item: "https://dshx.io/zh/plugins/example",
      },
    ]);
  });

  it("links a collection to its entries, and to the full total when paged", () => {
    const [page, list] = collection({
      locale: "en",
      to: "/plugins",
      name: "Plugins",
      description: "Published plugins.",
      items: [{ name: "Example", to: "/plugins/example" }],
      count: 1800,
      partOf: "https://dshx.io/#website",
    });
    expect(page).toMatchObject({
      "@id": "https://dshx.io/en/plugins#collection",
      mainEntity: { "@id": "https://dshx.io/en/plugins#items" },
      isPartOf: { "@id": "https://dshx.io/#website" },
    });
    expect(list).toMatchObject({ numberOfItems: 1800 });
    expect(list?.["itemListElement"]).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Example",
        url: "https://dshx.io/en/plugins/example",
      },
    ]);
  });

  it("leaves a collection without entries as one node", () => {
    expect(collection({ locale: "zh", to: "/docs", name: "文档" })).toHaveLength(1);
  });

  it("names the organization as author and publisher of an article", () => {
    const node = article({
      locale: "en",
      to: "/blog/entry",
      type: "BlogPosting",
      headline: "Entry",
      description: "An entry.",
      published: "2026-01-01T00:00:00.000Z",
      modified: "2026-01-02T00:00:00.000Z",
      partOf: "/blog",
    });
    expect(node).toMatchObject({
      "@id": "https://dshx.io/en/blog/entry#article",
      author: { "@id": "https://dshx.io/#organization" },
      publisher: { "@id": "https://dshx.io/#organization" },
      isPartOf: { "@id": "https://dshx.io/en/blog#collection" },
      datePublished: "2026-01-01T00:00:00.000Z",
    });
  });

  it("keeps a profile page and its subject apart", () => {
    const [page, subject] = profilePage({
      locale: "en",
      to: "/publishers/example",
      name: "Example",
      description: "Maintainer.",
      entity: { type: "Organization", name: "Example" },
    });
    expect(page).toMatchObject({
      "@type": "ProfilePage",
      mainEntity: { "@id": "https://dshx.io/en/publishers/example#subject" },
    });
    expect(subject).toMatchObject({ "@type": "Organization", name: "Example" });
  });

  it("only reports a rating once a plugin has two of them", () => {
    const base = {
      locale: "en",
      to: "/plugins/example",
      name: "Example",
      description: "A plugin.",
      version: "1.0.0",
      compatibility: "^0.2.0",
      author: "Evan",
      sameAs: [],
    } as const;
    expect(
      pluginApplication({ ...base, rating: { average: 5, count: 1 } })["aggregateRating"],
    ).toBeUndefined();
    expect(
      pluginApplication({ ...base, rating: { average: 4.5, count: 2 } })["aggregateRating"],
    ).toMatchObject({ ratingValue: 4.5, ratingCount: 2 });
  });

  it("asks one answered question per FAQ entry", () => {
    const node = faqPage({
      locale: "en",
      to: "/plugins",
      entries: [{ question: "What is it?", answer: "A hub." }],
    });
    expect(node).toMatchObject({
      "@id": "https://dshx.io/en/plugins#faq",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is it?",
          acceptedAnswer: { "@type": "Answer", text: "A hub." },
        },
      ],
    });
  });
});
