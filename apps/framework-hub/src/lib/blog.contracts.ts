import { z } from "zod";

export const blogSlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const sectionIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const paragraphTextSchema = z.string().trim().min(1).max(8_000);

const blogBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: paragraphTextSchema }).strict(),
  z
    .object({
      type: z.literal("list"),
      items: z.array(z.string().trim().min(1).max(2_000)).min(1).max(40),
    })
    .strict(),
  z
    .object({
      type: z.literal("code"),
      language: z
        .string()
        .trim()
        .max(40)
        .regex(/^[a-zA-Z0-9+#._-]*$/)
        .optional(),
      code: z.string().trim().min(1).max(20_000),
    })
    .strict(),
  z.object({ type: z.literal("quote"), text: paragraphTextSchema }).strict(),
  z
    .object({
      type: z.literal("image"),
      url: z.url({ protocol: /^https$/ }).max(2_000),
      alt: z.string().trim().min(1).max(300),
      caption: z.string().trim().min(1).max(300).optional(),
      width: z.number().int().positive().max(10_000).optional(),
      height: z.number().int().positive().max(10_000).optional(),
    })
    .strict(),
]);

const blogSectionSchema = z
  .object({
    id: sectionIdSchema,
    title: z.string().trim().min(1).max(180),
    blocks: z.array(blogBlockSchema).min(1).max(60),
  })
  .strict();

const localizedBlogContentSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(320),
    sections: z.array(blogSectionSchema).min(1).max(24),
  })
  .strict()
  .refine(
    (content) =>
      new Set(content.sections.map((section) => section.id)).size === content.sections.length,
    "Section IDs must be unique",
  );

export const blogContentSchema = z
  .object({ en: localizedBlogContentSchema, zh: localizedBlogContentSchema })
  .strict();

const writableFields = {
  publishedAt: z.iso.date(),
  status: z.enum(["draft", "published"]),
  coverImageUrl: z
    .url({ protocol: /^https$/ })
    .max(2_000)
    .nullable(),
  content: blogContentSchema,
  relatedPluginSlugs: z
    .array(blogSlugSchema)
    .max(8)
    .refine((slugs) => new Set(slugs).size === slugs.length, "Related plugin slugs must be unique"),
};

const writable = z
  .object(writableFields)
  .strict()
  .superRefine((entry, context) => {
    if (entry.status === "published" && entry.publishedAt > new Date().toISOString().slice(0, 10)) {
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "A published article cannot have a future publication date",
      });
    }
    if (new TextEncoder().encode(JSON.stringify(entry.content)).byteLength > 250_000) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: "Article content must fit within 250 KB",
      });
    }
  });

export const createBlogPostSchema = writable.safeExtend({ slug: blogSlugSchema });
export const updateBlogPostSchema = writable.safeExtend({
  ifRevision: z.number().int().positive(),
});

export type BlogBlock = z.infer<typeof blogBlockSchema>;
export type BlogSection = z.infer<typeof blogSectionSchema>;
export type LocalizedBlogContent = z.infer<typeof localizedBlogContentSchema>;
export type BlogContent = z.infer<typeof blogContentSchema>;
export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;
export type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>;

/**
 * The admin editor's article, and the admin list's summary, as
 * `/api/admin/blog` answers them. The editor writes with `createBlogPostSchema`
 * or `updateBlogPostSchema` and reads back the same shape it rendered.
 */
export const blogAdminArticleSchema = z.object({
  slug: z.string(),
  status: z.enum(["draft", "published"]),
  revision: z.number(),
  publishedAt: z.string(),
  coverImageUrl: z.string().nullable(),
  relatedPluginSlugs: z.array(z.string()),
  content: blogContentSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedByTokenId: z.string().nullable(),
});

export const blogAdminListSchema = z.object({
  items: z.array(
    z.object({
      slug: z.string(),
      status: z.enum(["draft", "published"]),
      revision: z.number(),
      publishedAt: z.string(),
      updatedAt: z.string(),
      coverImageUrl: z.string().nullable(),
      copy: z.object({
        en: z.object({ title: z.string(), description: z.string() }),
        zh: z.object({ title: z.string(), description: z.string() }),
      }),
    }),
  ),
});

export type BlogAdminArticle = z.infer<typeof blogAdminArticleSchema>;

export const replaceFeaturedPicksSchema = z
  .object({
    pluginSlugs: z
      .array(blogSlugSchema)
      .max(24)
      .refine(
        (slugs) => new Set(slugs).size === slugs.length,
        "Featured plugin slugs must be unique",
      ),
  })
  .strict();
export type ReplaceFeaturedPicksInput = z.infer<typeof replaceFeaturedPicksSchema>;
