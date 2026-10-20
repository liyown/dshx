import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { BlogPostSummary } from "@/lib/blog";
import { getBlogPost, listBlogPosts } from "@/lib/blog.repository.server";
import { listCatalogCardsBySlugs } from "@/lib/catalog/repository.server";
import { requireDatabase } from "@/lib/db/client";

export const loadBlog = createServerFn({ method: "GET" }).handler(({ context }) =>
  listBlogPosts(requireDatabase(context)),
);

export const loadBlogDetail = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1).max(120), locale: z.enum(["en", "zh"]) }))
  .handler(async ({ data, context }) => {
    const db = requireDatabase(context);
    const [record, summaries] = await Promise.all([getBlogPost(db, data.slug), listBlogPosts(db)]);
    if (!record) return null;
    const index = summaries.findIndex((entry) => entry.slug === data.slug);
    // A concurrently unpublished article must not leak through the detail loader.
    if (index < 0) return null;
    const post: BlogPostSummary = {
      slug: record.slug,
      status: record.status,
      revision: record.revision,
      publishedAt: record.publishedAt,
      updatedAt: record.updatedAt.toISOString(),
      coverImageUrl: record.coverImageUrl,
      copy: {
        en: { title: record.contentJson.en.title, description: record.contentJson.en.description },
        zh: { title: record.contentJson.zh.title, description: record.contentJson.zh.description },
      },
    };
    return {
      post,
      content: record.contentJson[data.locale],
      related: await listCatalogCardsBySlugs(db, record.relatedPluginSlugs, data.locale),
      newer: index > 0 ? summaries[index - 1] : undefined,
      older: summaries[index + 1],
    };
  });
