import { describe, expect, it } from "vitest";

import {
  catalogSortValues,
  marketplaceDetailResponseSchema,
  marketplaceListQuerySchema,
  marketplaceListResponseSchema,
  marketplaceSortValues,
  pluginListQuerySchema,
} from "./contracts";

describe("public discovery query", () => {
  it("keeps the full catalog sort contract and defaults to featured", () => {
    expect(catalogSortValues).toEqual([
      "featured",
      "trending",
      "updated",
      "new",
      "stars",
      "downloads",
    ]);
    expect(pluginListQuerySchema.parse({}).sort).toBe("featured");
  });
});

describe("marketplace list query", () => {
  it("defaults to latest and exposes only the Preview sort values", () => {
    expect(marketplaceSortValues).toEqual(["stars", "downloads", "latest"]);
    expect(marketplaceListQuerySchema.parse({}).sort).toBe("latest");
  });

  it.each(["featured", "trending", "updated", "new"])(
    "rejects the legacy discovery sort %s",
    (sort) => {
      expect(marketplaceListQuerySchema.safeParse({ sort }).success).toBe(false);
    },
  );
});

describe("marketplace response boundaries", () => {
  const card = {
    slug: "community-plugin",
    name: "Community plugin",
    scope: "@example/community-plugin",
    description: "A community marketplace plugin.",
    version: "1.2.3",
    compat: ">=0.1.0-rc.8 <0.2.0-0",
    category: "tools",
    badge: "community" as const,
    glyph: "V",
    iconUrl: null,
    author: "example",
  };

  it("validates list cards while preserving additive response fields", () => {
    const result = marketplaceListResponseSchema.parse({
      items: [card],
      nextCursor: null,
      categories: [{ slug: "tools", name: "Tools" }],
    });
    expect(result.items[0]?.["author"]).toBe("example");
  });

  it("validates the exact target response and rejects malformed compatibility", () => {
    expect(
      marketplaceDetailResponseSchema.parse({
        plugin: card,
        repositoryUrl: "https://github.com/example/community-plugin",
        installTargets: [
          {
            kind: "npm",
            spec: "@example/community-plugin@1.2.3",
            package_name: "@example/community-plugin",
            version: "1.2.3",
            integrity: null,
            is_primary: 1,
            status: "active",
          },
        ],
        releases: [
          {
            version: "1.2.3",
            channel: "stable",
            git_tag: "v1.2.3",
          },
        ],
      }).installTargets,
    ).toHaveLength(1);
    expect(
      marketplaceListResponseSchema.safeParse({
        items: [{ ...card, compat: "dsh latest" }],
        nextCursor: null,
        categories: [],
      }).success,
    ).toBe(false);
  });
});
