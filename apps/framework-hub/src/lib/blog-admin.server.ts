import { requireAdminSession, requireSameOrigin } from "@/lib/auth/auth.server";
import { invalidateBlogSitemap } from "@/lib/blog-cache.server";
import {
  createBlogPostSchema,
  updateBlogPostSchema,
  type CreateBlogPostInput,
  type UpdateBlogPostInput,
} from "@/lib/blog.contracts";
import {
  createBlogPost,
  getBlogPost,
  listBlogPosts,
  updateBlogPost,
  type BlogPostRecord,
} from "@/lib/blog.repository.server";
import { OperationHttpError } from "@/lib/catalog/operations-v1.http";
import { requireDatabase } from "@/lib/db/client";
import { HttpError, jsonError, readJson } from "@/lib/http";

/**
 * Admin mutations and the bearer-token Operations API share the article
 * repository. This adapter keeps the admin session surface on `HttpError`
 * responses while preserving the shared validation and conflict semantics.
 */
export function adminBlogResult(record: BlogPostRecord) {
  const { contentJson, id, createdAt, updatedAt, updatedByTokenId, ...fields } = record;
  return {
    ...fields,
    content: contentJson,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    updatedByTokenId: updatedByTokenId ?? null,
  };
}

export function adminBlogError(error: unknown): Response {
  if (error instanceof OperationHttpError)
    return jsonError(new HttpError(error.status, error.message, error.code, error.options.details));
  return jsonError(error);
}

export async function listBlogForAdmin(request: Request, context: unknown) {
  await requireAdminSession(request, context);
  return { items: await listBlogPosts(requireDatabase(context), true) };
}

export async function getBlogForAdmin(request: Request, context: unknown, slug: string) {
  await requireAdminSession(request, context);
  const post = await getBlogPost(requireDatabase(context), slug, true);
  if (!post) throw new HttpError(404, "Blog article not found", "blog_not_found");
  return adminBlogResult(post);
}

export async function createBlogForAdmin(request: Request, context: unknown) {
  await requireAdminSession(request, context);
  requireSameOrigin(request, context);
  const input = await readJson<CreateBlogPostInput>(request, createBlogPostSchema);
  const post = await createBlogPost(requireDatabase(context), null, input);
  invalidateBlogSitemap(request);
  return adminBlogResult(post);
}

export async function updateBlogForAdmin(request: Request, context: unknown, slug: string) {
  await requireAdminSession(request, context);
  requireSameOrigin(request, context);
  const input = await readJson<UpdateBlogPostInput>(request, updateBlogPostSchema);
  const post = await updateBlogPost(requireDatabase(context), null, slug, input);
  invalidateBlogSitemap(request);
  return adminBlogResult(post);
}
