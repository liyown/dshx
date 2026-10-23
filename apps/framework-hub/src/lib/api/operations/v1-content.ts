import { z } from "zod";

import {
  blogContentSchema,
  createBlogPostSchema,
  replaceFeaturedPicksSchema,
  updateBlogPostSchema,
} from "@/lib/blog.contracts";
import {
  changelogContentSchema,
  createChangelogSchema,
  updateChangelogSchema,
} from "@/lib/changelog.contracts";
import { defineOperation, type ApiOperationDefinition } from "@/lib/api/operation";

/**
 * Editorial content: release notes, blog articles and curated featured shelves.
 *
 * These endpoints are the write surface behind pages the public site reads, so
 * every answer is `cache-control: no-store`: a caller that has just written an
 * entry has to read that write back, not the previous response from an
 * intermediary. The response contracts below are the shapes the application
 * services build, including the stored dates their projections render as ISO
 * strings — a service that starts returning another field fails the type check
 * here instead of silently widening the published API.
 */

const noStore = { "cache-control": "no-store" } as const;

/** The listing copy both content types store per locale. */
const copySchema = z.object({
  en: z.object({ title: z.string(), description: z.string() }),
  zh: z.object({ title: z.string(), description: z.string() }),
});

const changelogSummarySchema = z.object({
  slug: z.string(),
  status: z.enum(["draft", "published"]),
  revision: z.number().int().positive(),
  version: z.string(),
  product: z.string(),
  channel: z.enum(["preview", "release"]),
  publishedAt: z.iso.date(),
  updatedAt: z.iso.datetime(),
  copy: copySchema,
});

const changelogEntrySchema = z.object({
  id: z.string(),
  slug: z.string(),
  status: z.enum(["draft", "published"]),
  version: z.string(),
  product: z.string(),
  channel: z.enum(["preview", "release"]),
  publishedAt: z.iso.date(),
  revision: z.number().int().positive(),
  updatedByTokenId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  content: changelogContentSchema,
});

const blogSummarySchema = z.object({
  slug: z.string(),
  status: z.enum(["draft", "published"]),
  revision: z.number().int().positive(),
  publishedAt: z.iso.date(),
  updatedAt: z.iso.datetime(),
  coverImageUrl: z
    .url({ protocol: /^https$/ })
    .max(2_000)
    .nullable(),
  copy: copySchema,
});

const blogPostSchema = z.object({
  id: z.string(),
  slug: z.string(),
  status: z.enum(["draft", "published"]),
  publishedAt: z.iso.date(),
  coverImageUrl: z
    .url({ protocol: /^https$/ })
    .max(2_000)
    .nullable(),
  revision: z.number().int().positive(),
  updatedByTokenId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  relatedPluginSlugs: z.array(z.string()),
  content: blogContentSchema,
});

const featuredPluginSchema = z.object({
  slug: z.string(),
  name: z.string(),
  status: z.string(),
  lifecycleStatus: z.string(),
  sortOrder: z.number().int(),
});

const featuredCategorySchema = z.object({
  slug: z.string(),
  active: z.boolean(),
  name: z.object({ en: z.string(), zh: z.string() }),
  description: z.object({ en: z.string().nullable(), zh: z.string().nullable() }),
  // The repository hands back a readonly pick list; the contract says so rather
  // than asserting the handler may reorder it on its way out.
  plugins: z.array(featuredPluginSchema).readonly(),
});

const operationErrors = [401, 403, 404, 409, 422] as const;

export const v1ContentOperations = {
  listChangelogEntries: defineOperation({
    operationId: "listChangelogEntries",
    path: "/api/ops/v1/changelog",
    method: "get",
    tag: "Operations",
    summary: "List changelog entries including drafts",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      headers: noStore,
      response: z.object({ items: z.array(changelogSummarySchema) }),
    },
    responses: { 200: "Changelog data. Requires catalog:write." },
    errors: operationErrors,
  }),
  createChangelogEntry: defineOperation({
    operationId: "createChangelogEntry",
    path: "/api/ops/v1/changelog",
    method: "post",
    tag: "Operations",
    summary: "Create a bilingual changelog draft or published update",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      body: createChangelogSchema,
      status: 201,
      headers: noStore,
      response: changelogEntrySchema,
    },
    responses: { 201: "Changelog data. Requires catalog:write." },
    errors: operationErrors,
  }),
  getChangelogEntry: defineOperation({
    operationId: "getChangelogEntry",
    path: "/api/ops/v1/changelog/{slug}",
    method: "get",
    tag: "Operations",
    summary: "Read a changelog entry and its current revision",
    auth: { via: "bearer" },
    spec: { envelope: "operation", headers: noStore, response: changelogEntrySchema },
    responses: { 200: "Changelog data. Requires catalog:write." },
    errors: operationErrors,
  }),
  updateChangelogEntry: defineOperation({
    operationId: "updateChangelogEntry",
    path: "/api/ops/v1/changelog/{slug}",
    method: "put",
    tag: "Operations",
    summary: "Edit, publish, or withdraw a changelog entry using ifRevision",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      body: updateChangelogSchema,
      status: 200,
      headers: noStore,
      response: changelogEntrySchema,
    },
    responses: { 200: "Changelog data. Requires catalog:write." },
    errors: operationErrors,
  }),
  listBlogPosts: defineOperation({
    operationId: "listBlogPosts",
    path: "/api/ops/v1/blog",
    method: "get",
    tag: "Operations",
    summary: "List blog articles including drafts",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      headers: noStore,
      response: z.object({ items: z.array(blogSummarySchema) }),
    },
    responses: { 200: "Blog data. Requires catalog:write." },
    errors: operationErrors,
  }),
  createBlogPost: defineOperation({
    operationId: "createBlogPost",
    path: "/api/ops/v1/blog",
    method: "post",
    tag: "Operations",
    summary: "Create a bilingual blog draft or published article",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      body: createBlogPostSchema,
      status: 201,
      headers: noStore,
      response: blogPostSchema,
    },
    responses: { 201: "Blog data. Requires catalog:write." },
    errors: operationErrors,
  }),
  getBlogPost: defineOperation({
    operationId: "getBlogPost",
    path: "/api/ops/v1/blog/{slug}",
    method: "get",
    tag: "Operations",
    summary: "Read a blog article and its current revision",
    auth: { via: "bearer" },
    spec: { envelope: "operation", headers: noStore, response: blogPostSchema },
    responses: { 200: "Blog data. Requires catalog:write." },
    errors: operationErrors,
  }),
  updateBlogPost: defineOperation({
    operationId: "updateBlogPost",
    path: "/api/ops/v1/blog/{slug}",
    method: "put",
    tag: "Operations",
    summary: "Edit, publish, or withdraw a blog article using ifRevision",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      body: updateBlogPostSchema,
      status: 200,
      headers: noStore,
      response: blogPostSchema,
    },
    responses: { 200: "Blog data. Requires catalog:write." },
    errors: operationErrors,
  }),
  listFeaturedShelves: defineOperation({
    operationId: "listFeaturedShelves",
    path: "/api/ops/v1/featured",
    method: "get",
    tag: "Operations",
    summary: "Read curated featured-plugin shelves",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      headers: noStore,
      response: z.object({ items: z.array(featuredCategorySchema) }),
    },
    responses: { 200: "Featured shelves. Requires catalog:write." },
    errors: operationErrors,
  }),
  replaceFeaturedShelf: defineOperation({
    operationId: "replaceFeaturedShelf",
    path: "/api/ops/v1/featured/{category}",
    method: "put",
    tag: "Operations",
    summary: "Replace the ordered plugin picks for one featured category",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      body: replaceFeaturedPicksSchema,
      status: 200,
      headers: noStore,
      response: z.object({ category: featuredCategorySchema }),
    },
    responses: { 200: "Featured shelf. Requires catalog:write." },
    errors: operationErrors,
  }),
} satisfies Record<string, ApiOperationDefinition>;

export const v1ContentOperationList: readonly ApiOperationDefinition[] =
  Object.values(v1ContentOperations);
