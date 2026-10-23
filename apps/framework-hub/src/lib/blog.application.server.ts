import type { CreateBlogPostInput, UpdateBlogPostInput } from "@/lib/blog.contracts";
import {
  createBlogPost,
  getBlogPost,
  listBlogPosts,
  updateBlogPost,
  type BlogPostRecord,
} from "@/lib/blog.repository.server";
import { OperationHttpError } from "@/lib/catalog/operations-v1.http";
import type { Database } from "@/lib/db/client";

/**
 * The article as two readers see it. The admin editor wants the article id and
 * rendered dates; the Operations API wants the stored record with its bilingual
 * JSON exposed as `content`. Both are projections of the same repository row,
 * so the mapping lives here rather than in each route.
 */
export async function listBlogArticles(db: Database) {
  return { items: await listBlogPosts(db, true) };
}

export async function readBlogArticle(db: Database, slug: string) {
  return operationsView(await requireArticle(db, slug));
}

export async function readAdminBlogArticle(db: Database, slug: string) {
  return adminView(await requireArticle(db, slug));
}

export async function writeBlogArticle(db: Database, tokenId: string, input: CreateBlogPostInput) {
  return operationsView(await createBlogPost(db, tokenId, input));
}

export async function createAdminBlogArticle(db: Database, input: CreateBlogPostInput) {
  return adminView(await createBlogPost(db, null, input));
}

export async function editBlogArticle(
  db: Database,
  tokenId: string,
  slug: string,
  input: UpdateBlogPostInput,
) {
  return operationsView(await updateBlogPost(db, tokenId, slug, input));
}

export async function updateAdminBlogArticle(
  db: Database,
  slug: string,
  input: UpdateBlogPostInput,
) {
  return adminView(await updateBlogPost(db, null, slug, input));
}

async function requireArticle(db: Database, slug: string): Promise<BlogPostRecord> {
  const post = await getBlogPost(db, slug, true);
  if (!post) throw new OperationHttpError(404, "blog_not_found", "Blog article not found");
  return post;
}

function operationsView(record: BlogPostRecord) {
  const { contentJson, ...fields } = record;
  return { ...fields, content: contentJson };
}

function adminView(record: BlogPostRecord) {
  const { contentJson, id, createdAt, updatedAt, updatedByTokenId, ...fields } = record;
  return {
    ...fields,
    content: contentJson,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    updatedByTokenId: updatedByTokenId ?? null,
  };
}
