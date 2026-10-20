import { createBlogPostSchema } from "@/lib/blog.contracts";

export function blogInput(slug = "test-blog-post", relatedPluginSlugs: string[] = []) {
  return createBlogPostSchema.parse({
    slug,
    status: "draft",
    publishedAt: "2026-08-22",
    coverImageUrl: null,
    relatedPluginSlugs,
    content: {
      en: {
        title: "A database article",
        description: "Editorial content stored in D1.",
        sections: [
          {
            id: "overview",
            title: "Overview",
            blocks: [
              { type: "paragraph", text: "This article is stored in the database." },
              { type: "list", items: ["Bilingual source content", "Editorial review"] },
            ],
          },
        ],
      },
      zh: {
        title: "数据库文章",
        description: "存储于 D1 的编辑内容。",
        sections: [
          {
            id: "overview",
            title: "概述",
            blocks: [
              { type: "paragraph", text: "这篇文章的内容来自数据库。" },
              { type: "quote", text: "同时维护中英文版本。" },
            ],
          },
        ],
      },
    },
  });
}
