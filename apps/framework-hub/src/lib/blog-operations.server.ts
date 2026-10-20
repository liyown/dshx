import { requireApiToken } from "@/lib/auth/tokens.server";
import type { Database } from "@/lib/db/client";
import { invalidateBlogSitemap } from "@/lib/blog-cache.server";
import { createBlogPostSchema, updateBlogPostSchema } from "@/lib/blog.contracts";
import {
  createBlogPost,
  getBlogPost,
  listBlogPosts,
  updateBlogPost,
  type BlogPostRecord,
} from "@/lib/blog.repository.server";
import { OperationHttpError, readOperationJson } from "@/lib/catalog/operations-v1.http";

function requireBlogOperator(db: Database, request: Request) {
  return requireApiToken(db, request, "catalog:write");
}

function operationEntry(row: BlogPostRecord) {
  const { contentJson, ...fields } = row;
  return { ...fields, content: contentJson };
}

export async function listBlogForOperations(db: Database, request: Request) {
  await requireBlogOperator(db, request);
  return { items: await listBlogPosts(db, true) };
}

export async function getBlogForOperations(db: Database, request: Request, slug: string) {
  await requireBlogOperator(db, request);
  const post = await getBlogPost(db, slug, true);
  if (!post) throw new OperationHttpError(404, "blog_not_found", "Blog article not found");
  return operationEntry(post);
}

export async function createBlogForOperations(db: Database, request: Request) {
  const actor = await requireBlogOperator(db, request);
  const input = await readOperationJson(request, createBlogPostSchema);
  const post = await createBlogPost(db, actor.token.id, input);
  invalidateBlogSitemap(request);
  return operationEntry(post);
}

export async function updateBlogForOperations(db: Database, request: Request, slug: string) {
  const actor = await requireBlogOperator(db, request);
  const input = await readOperationJson(request, updateBlogPostSchema);
  const post = await updateBlogPost(db, actor.token.id, slug, input);
  invalidateBlogSitemap(request);
  return operationEntry(post);
}
