import { describe, expect, it } from "vitest";
import { changelogInput } from "@/test/changelog";
import { formatDate } from "@/lib/i18n";
import { createChangelogSchema, updateChangelogSchema } from "./changelog.contracts";

describe("database changelog contracts", () => {
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
    expect(formatDate("2026-09-05", "en", "long")).toBe("September 5, 2026");
    expect(formatDate("2026-09-05", "zh", "long")).toBe("2026年9月5日");
  });
});
