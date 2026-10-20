import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";

import type { BlogPostSummary } from "@/lib/blog";
import type { CreateBlogPostInput, UpdateBlogPostInput } from "@/lib/blog.contracts";
import { OperationHttpError } from "@/lib/catalog/operations-v1.http";
import type { Database } from "@/lib/db/client";
import { blogPostPlugins as postPlugins, blogPosts as posts, plugins } from "@/lib/db/schema";

function published() {
  return and(
    eq(posts.status, "published"),
    lte(posts.publishedAt, new Date().toISOString().slice(0, 10)),
  );
}

const summaryColumns = {
  slug: posts.slug,
  status: posts.status,
  revision: posts.revision,
  publishedAt: posts.publishedAt,
  updatedAt: posts.updatedAt,
  coverImageUrl: posts.coverImageUrl,
  enTitle: sql<string>`json_extract(${posts.contentJson}, '$.en.title')`,
  enDescription: sql<string>`json_extract(${posts.contentJson}, '$.en.description')`,
  zhTitle: sql<string>`json_extract(${posts.contentJson}, '$.zh.title')`,
  zhDescription: sql<string>`json_extract(${posts.contentJson}, '$.zh.description')`,
};

export async function listBlogPosts(
  db: Database,
  includeDrafts = false,
): Promise<BlogPostSummary[]> {
  const rows = await db
    .select(summaryColumns)
    .from(posts)
    .where(includeDrafts ? undefined : published())
    .orderBy(desc(posts.publishedAt), desc(posts.slug));
  return rows.map(({ enTitle, enDescription, zhTitle, zhDescription, updatedAt, ...row }) => ({
    ...row,
    updatedAt: updatedAt.toISOString(),
    copy: {
      en: { title: enTitle, description: enDescription },
      zh: { title: zhTitle, description: zhDescription },
    },
  }));
}

async function relatedSlugs(db: Database, postId: string): Promise<string[]> {
  const rows = await db
    .select({ slug: plugins.slug })
    .from(postPlugins)
    .innerJoin(plugins, eq(plugins.id, postPlugins.pluginId))
    .where(eq(postPlugins.blogPostId, postId))
    .orderBy(postPlugins.sortOrder);
  return rows.map((row) => row.slug);
}

export async function getBlogPost(db: Database, slug: string, includeDrafts = false) {
  const [row] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), includeDrafts ? undefined : published()))
    .limit(1);
  if (!row) return null;
  return { ...row, relatedPluginSlugs: await relatedSlugs(db, row.id) };
}

export type BlogPostRecord = NonNullable<Awaited<ReturnType<typeof getBlogPost>>>;

async function resolvePluginIds(db: Database, slugs: readonly string[]) {
  if (slugs.length === 0) return [];
  const rows = await db
    .select({ id: plugins.id, slug: plugins.slug })
    .from(plugins)
    .where(inArray(plugins.slug, [...slugs]));
  const bySlug = new Map(rows.map((row) => [row.slug, row.id]));
  const missing = slugs.filter((slug) => !bySlug.has(slug));
  if (missing.length > 0)
    throw new OperationHttpError(
      422,
      "blog_plugin_not_found",
      "One or more related plugins do not exist.",
      false,
      { path: "relatedPluginSlugs", details: { missing } },
    );
  return slugs.map((slug) => ({
    pluginId: bySlug.get(slug) as string,
    sortOrder: slugs.indexOf(slug),
  }));
}

export async function createBlogPost(
  db: Database,
  tokenId: string | null,
  input: CreateBlogPostInput,
) {
  if (await getBlogPost(db, input.slug, true))
    throw new OperationHttpError(
      409,
      "blog_slug_conflict",
      "This blog slug already exists; fetch it before editing.",
    );
  const links = await resolvePluginIds(db, input.relatedPluginSlugs);
  const { content, relatedPluginSlugs, ...fields } = input;
  const [created] = await db
    .insert(posts)
    .values({
      ...fields,
      id: crypto.randomUUID(),
      contentJson: content,
      updatedByTokenId: tokenId,
    })
    .onConflictDoNothing({ target: posts.slug })
    .returning();
  if (!created)
    throw new OperationHttpError(
      409,
      "blog_slug_conflict",
      "This blog slug already exists; fetch it before editing.",
    );
  if (links.length > 0)
    await db.insert(postPlugins).values(links.map((link) => ({ ...link, blogPostId: created.id })));
  return { ...created, relatedPluginSlugs };
}

export async function updateBlogPost(
  db: Database,
  tokenId: string | null,
  slug: string,
  input: UpdateBlogPostInput,
) {
  const existing = await getBlogPost(db, slug, true);
  if (!existing) throw new OperationHttpError(404, "blog_not_found", "Blog article not found");
  if (existing.revision !== input.ifRevision)
    throw new OperationHttpError(
      409,
      "revision_conflict",
      "The article changed. Fetch it, merge your changes, and retry with its current revision.",
      false,
      {
        repairHint: `GET /api/ops/v1/blog/${slug}, then use its revision as ifRevision.`,
      },
    );
  const links = await resolvePluginIds(db, input.relatedPluginSlugs);
  const { ifRevision, content, relatedPluginSlugs, ...fields } = input;
  const [updated] = await db
    .update(posts)
    .set({
      ...fields,
      contentJson: content,
      revision: sql`${posts.revision} + 1`,
      updatedAt: new Date(),
      updatedByTokenId: tokenId,
    })
    .where(and(eq(posts.slug, slug), eq(posts.revision, ifRevision)))
    .returning();
  if (!updated)
    throw new OperationHttpError(
      409,
      "revision_conflict",
      "The article changed. Fetch it, merge your changes, and retry with its current revision.",
      false,
      {
        repairHint: `GET /api/ops/v1/blog/${slug}, then use its revision as ifRevision.`,
      },
    );
  await db.delete(postPlugins).where(eq(postPlugins.blogPostId, updated.id));
  if (links.length > 0)
    await db.insert(postPlugins).values(links.map((link) => ({ ...link, blogPostId: updated.id })));
  return { ...updated, relatedPluginSlugs };
}
