import { describe, expect, it } from "vitest";

import { createBlogPostSchema } from "./blog.contracts";
import { parseBlogBody, preserveSectionIds, serializeBlogBody } from "./blog-editor";
import { blogInput } from "@/test/blog";

describe("blog editor body syntax", () => {
  it("maps headings, lists, quotes, code, and paragraphs to stored blocks", () => {
    const sections = parseBlogBody(
      [
        "Opening paragraph.",
        "",
        "## Install",
        "",
        "Set up the package.",
        "",
        "- First step",
        "- Second step",
        "",
        "> Keep the exact version.",
        "",
        "```bash",
        "pnpm add @dshx/example",
        "```",
      ].join("\n"),
      "en",
    );

    expect(sections.map((section) => section.title)).toEqual(["Overview", "Install"]);
    expect(sections[1]?.id).toBe("install");
    expect(sections[1]?.blocks).toEqual([
      { type: "paragraph", text: "Set up the package." },
      { type: "list", items: ["First step", "Second step"] },
      { type: "quote", text: "Keep the exact version." },
      { type: "code", language: "bash", code: "pnpm add @dshx/example" },
    ]);
  });

  it("round-trips serialized article bodies", () => {
    const body = "## One\n\nA paragraph.\n\n- Item\n\n```ts\nconst value = 1;\n```\n\n## 中文";
    const first = parseBlogBody(body, "en");
    expect(parseBlogBody(serializeBlogBody(first), "en")).toEqual(first);
  });

  it("uses positional ids when a heading has no ASCII slug", () => {
    const sections = parseBlogBody("## 中文标题\n\n正文。", "zh");
    expect(sections[0]?.id).toBe("section-1");
  });

  it("preserves stored anchors when an edited heading keeps its title", () => {
    const previous = [
      { id: "intro", title: "Overview", blocks: [] },
      { id: "custom-anchor", title: "Install", blocks: [] },
    ];
    const parsed = parseBlogBody("## Overview\n\nUpdated.\n\n## Install\n\nSteps.", "en");
    expect(
      preserveSectionIds(parsed, previous).map((section) => [section.title, section.id]),
    ).toEqual([
      ["Overview", "intro"],
      ["Install", "custom-anchor"],
    ]);
  });

  it("never produces duplicate ids when a new section collides with a stored anchor", () => {
    const previous = [{ id: "section-2", title: "Overview", blocks: [] }];
    const parsed = parseBlogBody("## Overview\n\nIntro.\n\n## 中文标题\n\n正文。", "zh");
    const preserved = preserveSectionIds(parsed, previous);
    expect(preserved[0]?.id).toBe("section-2");
    expect(new Set(preserved.map((section) => section.id)).size).toBe(preserved.length);
  });
});

describe("blog contracts", () => {
  it("accepts a complete bilingual draft", () => {
    expect(blogInput().content.zh.title).toBe("数据库文章");
  });

  it("rejects unsafe covers, duplicate plugins, future publication, and missing translations", () => {
    const input = blogInput();
    expect(
      createBlogPostSchema.safeParse({ ...input, coverImageUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(
      createBlogPostSchema.safeParse({
        ...input,
        relatedPluginSlugs: ["one", "one"],
      }).success,
    ).toBe(false);
    expect(
      createBlogPostSchema.safeParse({
        ...input,
        status: "published",
        publishedAt: "2999-01-01",
      }).success,
    ).toBe(false);
    const { zh: _zh, ...withoutChinese } = input.content;
    expect(createBlogPostSchema.safeParse({ ...input, content: withoutChinese }).success).toBe(
      false,
    );
  });

  it("rejects duplicate section ids", () => {
    const input = blogInput();
    const section = input.content.en.sections[0];
    if (!section) throw new Error("fixture must contain a section");
    expect(
      createBlogPostSchema.safeParse({
        ...input,
        content: {
          ...input.content,
          en: { ...input.content.en, sections: [section, section] },
        },
      }).success,
    ).toBe(false);
  });
});
