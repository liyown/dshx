import { z } from "zod";

import { defineOperation, type ApiOperationDefinition } from "@/lib/api/operation";
import { localeQuery } from "@/lib/api/route";
import {
  catalogListQueryParams,
  localeSchema,
  pluginListQuerySchema,
  pluginReviewPageSchema,
} from "@/lib/catalog/contracts";

/**
 * Public catalog reads.
 *
 * Nothing here authenticates: these are the endpoints the published site and
 * third-party readers call. The list and detail pages are assembled by SQL, so
 * their responses are not derived from a table — the shapes below are written
 * from what the handlers answer, and the handlers are typed by them in turn.
 */

/** The card every catalog surface renders, as the list query builds it. */
const catalogCardSchema = z.object({
  slug: z.string(),
  name: z.string(),
  scope: z.string(),
  description: z.string(),
  author: z.string(),
  version: z.string(),
  compat: z.string(),
  publishedAt: z.string().nullable(),
  updated: z.string(),
  category: z.string(),
  stars: z.number().nullable(),
  downloads: z.string(),
  badge: z.enum(["official", "community"]),
  glyph: z.string(),
  iconUrl: z.string().nullable(),
  publisher: z.object({ login: z.string(), avatarUrl: z.string().nullable() }),
  featured: z.boolean(),
  trending: z.boolean(),
  isNew: z.boolean(),
});

const catalogListResponseSchema = z.object({
  items: z.array(catalogCardSchema),
  nextCursor: z.string().nullable(),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  categories: z.array(z.object({ slug: z.string(), name: z.string() })),
});

const catalogDetailResponseSchema = z.object({
  plugin: catalogCardSchema,
  id: z.string(),
  identityKey: z.string(),
  lifecycleStatus: z.string(),
  license: z.string().nullable(),
  homepageUrl: z.string().nullable(),
  repositoryUrl: z.string().nullable(),
  overviewMarkdown: z.string().nullable(),
  installNotesMarkdown: z.string().nullable(),
  seoTitle: z.string(),
  seoDescription: z.string(),
  indexable: z.boolean(),
  readyLocales: z.array(localeSchema),
  /** Set when the requested slug is an alias: the handler answers 308 instead. */
  redirectSlug: z.string().nullable(),
  installTargets: z.array(
    z.object({
      kind: z.string(),
      spec: z.string(),
      package_name: z.string(),
      version: z.string(),
      integrity: z.string().nullable(),
      is_primary: z.number(),
      status: z.string(),
    }),
  ),
  releases: z.array(
    z.object({
      version: z.string(),
      channel: z.string(),
      git_tag: z.string().nullable(),
      compatibility_range: z.string().nullable(),
      release_notes_url: z.string().nullable(),
      deprecated: z.number(),
      published_at: z.number().nullable(),
    }),
  ),
  dependencies: z.array(
    z.object({ package_name: z.string(), version_range: z.string(), kind: z.string() }),
  ),
  links: z.array(z.object({ kind: z.string(), url: z.string(), label: z.string().nullable() })),
  categories: z.array(
    z.object({ slug: z.string(), name: z.string().nullable(), is_primary: z.number() }),
  ),
  capabilities: z.array(
    z.object({ kind: z.string(), identifier: z.string(), metadata_json: z.string().nullable() }),
  ),
  media: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      content_type: z.string(),
      width: z.number().nullable(),
      height: z.number().nullable(),
      alt_text: z.string().nullable(),
      caption: z.string().nullable(),
    }),
  ),
  sourceReadme: z
    .object({
      availability: z.enum(["available", "unavailable"]),
      format: z.literal("markdown"),
      sourceUrl: z.string(),
      sourceRef: z.string().nullable(),
      sourcePath: z.string().nullable(),
      content: z.string().nullable(),
      contentHash: z.string().nullable(),
      observedAt: z.string(),
    })
    .nullable(),
  rating: z.object({ count: z.number(), average: z.number() }).nullable(),
  related: z.array(catalogCardSchema),
});

/**
 * Reviews are read backwards from the cursor (`created_at < cursor`), so an
 * absent cursor starts just after now and answers the newest page.
 */
const pluginReviewsQuerySchema = z.object({
  cursor: z.coerce
    .number()
    .int()
    .finite()
    .default(() => Date.now() + 1),
  limit: z.coerce
    .number()
    .int()
    .finite()
    .default(20)
    .transform((value) => Math.min(Math.max(value, 1), 50)),
});

/**
 * `getPublicPublisher` hands back the D1 rows it selected (`p.*`), typed as open
 * records at the persistence boundary. The profile and its published plugins are
 * documented as those open records rather than inventing a shape the service
 * does not promise.
 */
const publisherResponseSchema = z.object({
  publisher: z.record(z.string(), z.unknown()),
  plugins: z.array(z.record(z.string(), z.unknown())),
});

/**
 * The 503 union the endpoint documents: a ready/degraded report names the
 * migration and both dependencies, an error report says a dependency failed
 * mid-check, and an unavailable report carries the binding error. The declaration
 * requires the database, so a deployment with no D1 binding is answered before
 * the handler runs; `unavailable` stays in the contract a probe may already read.
 */
const hubHealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "unavailable", "error"]),
  database: z.literal("cloudflare-d1"),
  orm: z.literal("drizzle"),
  migration: z.string().nullable().optional(),
  requiredTables: z.enum(["ready", "missing"]).optional(),
  media: z.enum(["ready", "missing"]).optional(),
  message: z.string().optional(),
});

/**
 * The published locale parameter keeps its `en` default. The route still reads
 * `locale` off the URL before validation, so the default only describes what a
 * caller may omit.
 */
const localeQuerySpec = {
  query: localeQuery.query,
  querySchema: z.object({ locale: localeSchema.default("en") }),
};

export const catalogOperations = {
  listCatalogPlugins: defineOperation({
    operationId: "listCatalogPlugins",
    path: "/api/plugins",
    method: "get",
    tag: "Catalog",
    summary: "List published plugins",
    auth: { via: "public" },
    spec: {
      query: catalogListQueryParams,
      querySchema: pluginListQuerySchema,
      response: catalogListResponseSchema,
    },
    responses: { 200: "A cursor-paginated plugin collection." },
    errors: [400],
  }),
  getCatalogPlugin: defineOperation({
    operationId: "getCatalogPlugin",
    path: "/api/plugins/{slug}",
    method: "get",
    tag: "Catalog",
    summary: "Get one published plugin",
    auth: { via: "public" },
    spec: { ...localeQuerySpec, response: catalogDetailResponseSchema },
    responses: {
      200: "Published plugin metadata and source evidence.",
      308: "The plugin has a canonical replacement slug.",
    },
    errors: [404],
  }),
  listPluginReviews: defineOperation({
    operationId: "listPluginReviews",
    path: "/api/plugins/{slug}/reviews",
    method: "get",
    tag: "Catalog",
    summary: "List published plugin reviews",
    auth: { via: "public" },
    spec: { querySchema: pluginReviewsQuerySchema, response: pluginReviewPageSchema },
    responses: { 200: "A cursor-paginated collection of public reviews." },
    errors: [404],
  }),
  getPublisher: defineOperation({
    operationId: "getPublisher",
    path: "/api/publishers/{login}",
    method: "get",
    tag: "Catalog",
    summary: "Get a public publisher profile",
    auth: { via: "public" },
    spec: { ...localeQuerySpec, response: publisherResponseSchema },
    responses: { 200: "Publisher metadata and published plugins." },
    errors: [404],
  }),
  getHubHealth: defineOperation({
    operationId: "getHubHealth",
    path: "/api/health",
    method: "get",
    tag: "Catalog",
    summary: "Check Hub storage dependencies",
    auth: { via: "public" },
    spec: { response: hubHealthResponseSchema },
    responses: {
      200: "D1 and R2 dependencies are ready.",
      503: "One or more Hub dependencies are unavailable.",
    },
  }),
} satisfies Record<string, ApiOperationDefinition>;

export const catalogOperationList: readonly ApiOperationDefinition[] =
  Object.values(catalogOperations);
