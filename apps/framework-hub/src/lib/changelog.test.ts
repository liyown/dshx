import { describe, expect, it } from "vitest";
import { changelogInput, changelogSummary } from "@/test/changelog";
import { formatChangelogDate } from "./changelog";
import { createChangelogSchema, updateChangelogSchema } from "./changelog.contracts";
import { buildChangelogArticleHead, buildChangelogListHead } from "./changelog-seo";

describe("database changelog contracts and SEO", () => {
  it("requires complete translations, safe links, and unique section anchors", () => {
    const input = changelogInput();
    expect(createChangelogSchema.safeParse({ ...input, slug: "../entry" }).success).toBe(false);
    expect(
      createChangelogSchema.safeParse({ ...input, content: { en: input.content.en } }).success,
    ).toBe(false);
    const content = structuredClone(input.content);
    content.en.links.push({ label: "unsafe", href: "javascript:alert(1)" });
    expect(createChangelogSchema.safeParse({ ...input, content }).success).toBe(false);
    content.en.links = [];
    content.en.sections.push(content.en.sections[0]!);
    expect(createChangelogSchema.safeParse({ ...input, content }).success).toBe(false);
  });
  it("requires optimistic concurrency and rejects future publication", () => {
    const input = changelogInput();
    const fields = {
      version: input.version,
      product: input.product,
      channel: input.channel,
      status: input.status,
      publishedAt: input.publishedAt,
      content: input.content,
    };
    expect(updateChangelogSchema.safeParse(fields).success).toBe(false);
    expect(updateChangelogSchema.safeParse({ ...fields, ifRevision: 1 }).success).toBe(true);
    expect(
      createChangelogSchema.safeParse({ ...input, status: "published", publishedAt: "9999-12-31" })
        .success,
    ).toBe(false);
  });
  it("formats release dates without shifting calendar days", () => {
    expect(formatChangelogDate("2026-09-05", "en")).toBe("September 5, 2026");
    expect(formatChangelogDate("2026-09-05", "zh")).toBe("2026年9月5日");
  });
  it.each(["en", "zh"] as const)(
    "builds %s metadata from the supplied database records",
    (locale) => {
      const entry = changelogSummary();
      const head = buildChangelogArticleHead(locale, entry);
      const canonical = `https://dshx.io/${locale}/changelog/${entry.slug}`;
      expect(head.links).toContainEqual({ rel: "canonical", href: canonical });
      expect(head.links.filter((link) => link["rel"] === "alternate")).toHaveLength(3);
      expect(head.meta).toContainEqual({
        name: "description",
        content: entry.copy[locale].description,
      });
      const graph = JSON.parse(head.scripts[0]!.children)["@graph"];
      expect(
        graph.find((node: Record<string, unknown>) => node["@type"] === "BlogPosting"),
      ).toMatchObject({
        headline: entry.copy[locale].title,
        mainEntityOfPage: canonical,
        datePublished: entry.publishedAt,
        dateModified: entry.updatedAt,
      });
      const list = buildChangelogListHead(locale, [entry]);
      expect(
        JSON.parse(list.scripts[0]!.children)["@graph"][0].mainEntity.itemListElement[0].url,
      ).toBe(canonical);
      expect(
        JSON.parse(buildChangelogListHead(locale, []).scripts[0]!.children)["@graph"][0].mainEntity
          .numberOfItems,
      ).toBe(0);
    },
  );
  it("keeps database text from breaking out of JSON-LD scripts", () => {
    const entry = changelogSummary();
    const title = '</script><script>alert("untrusted")</script>';
    const changed = { ...entry, copy: { ...entry.copy, en: { ...entry.copy.en, title } } };
    const head = buildChangelogArticleHead("en", changed);
    expect(head.scripts[0]!.children).not.toContain("</script>");
    expect(JSON.parse(head.scripts[0]!.children)["@graph"][1].headline).toBe(title);
  });
});
