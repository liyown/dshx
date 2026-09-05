import { z } from "zod";

export const changelogSlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const sectionSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(180),
    paragraphs: z.array(z.string().trim().min(1).max(4000)).max(20).optional(),
    items: z.array(z.string().trim().min(1).max(2000)).max(30).optional(),
  })
  .strict()
  .refine(
    (section) => (section.paragraphs?.length ?? 0) + (section.items?.length ?? 0) > 0,
    "A section must contain text",
  );

const localizedContentSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(320),
    sections: z.array(sectionSchema).min(1).max(30),
    links: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(160),
            href: z.url({ protocol: /^https$/ }).max(2000),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .refine(
    (content) =>
      new Set(content.sections.map((section) => section.id)).size === content.sections.length,
    "Section IDs must be unique",
  );

export const changelogContentSchema = z
  .object({ en: localizedContentSchema, zh: localizedContentSchema })
  .strict();
const fields = {
  version: z.string().trim().min(1).max(80),
  product: z.string().trim().min(1).max(120),
  channel: z.enum(["preview", "release"]),
  publishedAt: z.iso.date(),
  status: z.enum(["draft", "published"]),
  content: changelogContentSchema,
};
const writable = z
  .object(fields)
  .strict()
  .superRefine((entry, context) => {
    if (entry.status === "published" && entry.publishedAt > new Date().toISOString().slice(0, 10)) {
      context.addIssue({
        code: "custom",
        path: ["publishedAt"],
        message: "A published release cannot have a future publication date",
      });
    }
    if (new TextEncoder().encode(JSON.stringify(entry.content)).byteLength > 200_000) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: "Article content must fit within 200 KB",
      });
    }
  });

export const createChangelogSchema = writable.safeExtend({ slug: changelogSlugSchema });
export const updateChangelogSchema = writable.safeExtend({
  ifRevision: z.number().int().positive(),
});
export type ChangelogContent = z.infer<typeof changelogContentSchema>;
export type CreateChangelogInput = z.infer<typeof createChangelogSchema>;
export type UpdateChangelogInput = z.infer<typeof updateChangelogSchema>;
