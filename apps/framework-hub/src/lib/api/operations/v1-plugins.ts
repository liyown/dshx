import {
  observationBatchSchema,
  operationAuditQuerySchema,
  operationErrorSchema,
  operationMediaMetadataSchema,
  opsPluginListQuerySchema,
  pluginCurationRequestSchema,
  pluginNeedValues,
  pluginObservationV1Schema,
  pluginRiskValues,
  pluginStateValues,
  pluginVisibilityRequestSchema,
} from "@becomeopc/dshx-hub-contracts";
import { z } from "zod";

import { defineOperation, type ApiOperationDefinition } from "@/lib/api/operation";
import { listQuery, type RouteSpec } from "@/lib/api/route";

/**
 * Operations v1: the plugin lifecycle.
 *
 * The reads and writes an operator or agent drives — the plugin list and
 * detail, observations, curation, visibility, media, the status summary, the
 * administrator bundle, the audit sweep, and the ranking repair — declared
 * once. Each route module builds its handler from the declaration here, so the
 * published path, method, authentication and payload cannot drift from what is
 * served.
 *
 * Response contracts are drawn from what the service returns, not from a
 * generic object: the schema types the handler's return here, so a field the
 * service stops sending stops compiling in the route that serves it.
 */

const localizationSchema = z.object({ en: z.string(), zh: z.string() });

/**
 * The facts and provenance a projection carries are JSON by contract: the
 * observation schema describes what producers may send, but a stored row may
 * still hold an older section. These record schemas say exactly that without
 * pretending to know the shape.
 */
const jsonRecordSchema = z.record(z.string(), z.unknown());

/** What one observation source contributed, as the list and detail report it. */
const sourceSummarySchema = z.object({
  kind: z.enum(["npm", "github", "readme", "release", "manual"]),
  url: z.string(),
  ref: z.string().optional(),
  etag: z.string().optional(),
  contentHash: z.string().optional(),
  availability: z.enum(["available", "unavailable"]),
  lastObservedAt: z.string(),
  lastSuccessfulAt: z.string().optional(),
  observationId: z.string(),
});

const operationalPluginSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  identity: z.string(),
  state: z.enum(pluginStateValues),
  visibility: z.enum(["visible", "hidden"]),
  revision: z.number().int(),
  lastObservedAt: z.string().nullable(),
  updatedAt: z.string(),
  needs: z.array(z.enum(pluginNeedValues)),
  riskSignals: z.array(z.enum(pluginRiskValues)),
  sources: z.array(sourceSummarySchema),
});

const operationalPluginListSchema = z.object({
  items: z.array(operationalPluginSummarySchema),
  nextCursor: z.string().nullable(),
});

/**
 * The curated copy as the detail endpoint relays it: a localized document when
 * the row was projected from `plugin_localizations`, and the raw stored JSON
 * sections when it was read straight from `plugin_curations`.
 */
const curationSectionSchema = z.union([localizationSchema, jsonRecordSchema]);
const curationListSectionSchema = z.union([jsonRecordSchema, z.array(z.string())]);
const storedCurationSchema = z.object({
  displayName: curationSectionSchema,
  shortDescription: curationSectionSchema,
  overviewMarkdown: curationSectionSchema,
  sourceReadmeHash: z.string().optional(),
  categories: curationListSectionSchema,
  tags: curationListSectionSchema,
  derivedFrom: curationListSectionSchema,
  updatedAt: z.string(),
  lowQuality: z.boolean().optional(),
});

const operationalPluginSchema = z.object({
  id: z.string(),
  slug: z.string(),
  identity: z.string(),
  identities: z.array(z.object({ key: z.string(), kind: z.string() })),
  state: z.enum(["draft", "published"]),
  visibility: z.object({
    state: z.enum(["visible", "hidden"]),
    reason: z.string().nullable(),
    changedAt: z.string().nullable(),
  }),
  revision: z.number().int(),
  lastObservedAt: z.string().nullable(),
  evidence: jsonRecordSchema.nullable(),
  sources: z.array(sourceSummarySchema),
  facts: jsonRecordSchema,
  installTargets: z.array(jsonRecordSchema),
  curation: storedCurationSchema.nullable(),
  riskSignals: z.array(z.enum(pluginRiskValues)),
  needs: z.array(z.enum(pluginNeedValues)),
  media: z.array(jsonRecordSchema),
  recentAudit: z.array(jsonRecordSchema),
});

const fieldDiffSchema = z.object({
  path: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  source: z.object({ kind: z.string(), url: z.string(), observationId: z.string() }).optional(),
});

const observationWriteResultSchema = z.object({
  identity: z.string(),
  pluginId: z.string().nullable(),
  status: z.enum(["created", "updated", "unchanged"]),
  revision: z.number().int().nullable(),
  diff: z.array(fieldDiffSchema),
});

const observationRejectionSchema = z.object({
  identity: z.string(),
  status: z.literal("rejected"),
  error: operationErrorSchema,
});

const observationBatchResultSchema = z.object({
  results: z.array(z.union([observationWriteResultSchema, observationRejectionSchema])),
});

const curationContentSchema = z.object({
  displayName: localizationSchema,
  shortDescription: localizationSchema,
  overviewMarkdown: localizationSchema,
  sourceReadmeHash: z.string().optional(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  derivedFrom: z.array(z.string()),
});

const curationResultSchema = z.object({
  status: z.enum(["unchanged", "updated"]),
  pluginId: z.string(),
  revision: z.number().int(),
  content: z.union([curationContentSchema, storedCurationSchema]).nullable(),
});

const visibilityResultSchema = z.object({
  status: z.enum(["unchanged", "updated"]),
  pluginId: z.string(),
  visibility: z.enum(["hidden", "visible"]),
  reason: z.string().optional(),
  revision: z.number().int(),
});

/**
 * A stored media row and a replay answer with different fields: the replay only
 * says which object it repaired, while a write reports what was stored.
 */
const mediaStoredSchema = z.object({
  status: z.enum(["created", "updated"]),
  id: z.string(),
  key: z.string(),
  sha256: z.string(),
  contentType: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  byteSize: z.number().int(),
  deduplicatedObject: z.boolean(),
  revision: z.number().int(),
});
const mediaUnchangedSchema = z.object({
  status: z.literal("unchanged"),
  id: z.string(),
  key: z.string(),
  sha256: z.string(),
  revision: z.number().int(),
  repairedObject: z.boolean(),
});
const mediaResultSchema = z.union([mediaStoredSchema, mediaUnchangedSchema]);

/**
 * The multipart form, documented as the two fields the handler reads: the file
 * part and its JSON metadata. The handler parses the bytes itself, so this
 * schema describes the upload rather than validating it.
 */
const mediaFormSchema = z.object({
  file: z.string().describe("The media file, as a multipart part."),
  metadata: operationMediaMetadataSchema,
});

const operationsStatusSchema = z.object({
  hub: z.object({ reachable: z.boolean(), version: z.string() }),
  auth: z.object({ authenticated: z.boolean(), scopes: z.array(z.string()) }),
  catalog: z.object({
    plugins: z.number().int(),
    published: z.number().int(),
    drafts: z.number().int(),
    hidden: z.number().int(),
    needsRefresh: z.number().int(),
    needsContent: z.number().int(),
    needsReadme: z.number().int(),
    needsPublisher: z.number().int(),
    needsMetadata: z.number().int(),
    needsTarget: z.number().int(),
    sourceFailures: z.number().int(),
  }),
  submissions: z.object({ queued: z.number().int() }),
});

const agentBundleSchema = z.object({
  bootstrap: z.string(),
  prompt: z.string(),
  resources: z.record(z.string(), z.string()),
  meta: z.object({
    promptVersion: z.number().int(),
    cliVersion: z.string(),
    cliChannel: z.string(),
    capabilitiesHash: z.string(),
    contentSha256: z.string(),
    sourceUrl: z.string(),
    npxCommand: z.string(),
  }),
});

const auditIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["critical", "warning"]),
  count: z.number().int(),
  sampleIds: z.array(z.string()),
});

const operationsAuditSchema = z.object({
  scope: z.enum(["catalog", "storage", "community"]),
  checkedAt: z.string(),
  issues: z.array(auditIssueSchema),
  summary: z.object({ critical: z.number().int(), warnings: z.number().int() }),
});

const catalogScoresSchema = z.object({ refreshed: z.literal("all") });

const dryRunQuerySchema = z.object({ dryRun: z.boolean().default(false) });

const pluginListQuery = {
  query: (params: URLSearchParams) => ({
    state: listQuery(params, "state"),
    needs: listQuery(params, "needs"),
    source: listQuery(params, "source"),
    risk: listQuery(params, "risk"),
    observedBefore: params.get("observedBefore") ?? undefined,
    updatedBefore: params.get("updatedBefore") ?? undefined,
    limit: params.has("limit") ? Number(params.get("limit")) : undefined,
    cursor: params.get("cursor") ?? undefined,
  }),
  querySchema: opsPluginListQuerySchema,
} as const;

/** The bundle is the one operations endpoint that bypasses the catalog scope. */
const agentBundleSpec = {
  envelope: "operation",
  headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
  response: agentBundleSchema,
} satisfies RouteSpec<void, void, z.infer<typeof agentBundleSchema>>;

export const v1PluginOperations = {
  listOperationalPlugins: defineOperation({
    operationId: "listOperationalPlugins",
    path: "/api/ops/v1/plugins",
    method: "get",
    tag: "Operations",
    summary: "List operational plugin projections",
    auth: { via: "bearer" },
    spec: {
      ...pluginListQuery,
      envelope: "operation",
      response: operationalPluginListSchema,
    },
    responses: { 200: "A cursor-paginated operational plugin collection." },
    errors: [400, 401, 404],
  }),
  getOperationalPlugin: defineOperation({
    operationId: "getOperationalPlugin",
    path: "/api/ops/v1/plugins/{id}",
    method: "get",
    tag: "Operations",
    summary: "Get one operational plugin projection",
    auth: { via: "bearer" },
    spec: { envelope: "operation", response: operationalPluginSchema },
    responses: { 200: "The complete operational plugin projection." },
    errors: [400, 401, 404],
  }),
  upsertObservation: defineOperation({
    operationId: "upsertObservation",
    path: "/api/ops/v1/observations/{observationId}",
    method: "put",
    tag: "Operations",
    summary: "Validate and upsert one source observation",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      // `dryRun` is read from the request by the handler, which also rejects a
      // repeated flag; the query contract documents the flag it accepts.
      query: (params: URLSearchParams) => ({ dryRun: params.get("dryRun") === "true" }),
      querySchema: dryRunQuerySchema,
      body: pluginObservationV1Schema,
      response: observationWriteResultSchema,
    },
    responses: { 200: "Observation validation or merge result." },
    errors: [400, 401, 404, 409, 422],
  }),
  upsertObservationBatch: defineOperation({
    operationId: "upsertObservationBatch",
    path: "/api/ops/v1/observations:batch",
    method: "post",
    tag: "Operations",
    summary: "Validate and upsert source observations independently",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      body: observationBatchSchema,
      response: observationBatchResultSchema,
    },
    responses: { 200: "Per-observation validation and merge results." },
    errors: [400, 401, 404, 422],
  }),
  curatePlugin: defineOperation({
    operationId: "curatePlugin",
    path: "/api/ops/v1/plugins/{id}/curation",
    method: "patch",
    tag: "Operations",
    summary: "Update curated plugin content with revision control",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      body: pluginCurationRequestSchema,
      response: curationResultSchema,
    },
    responses: { 200: "Updated curation projection." },
    errors: [400, 401, 404, 409, 422],
  }),
  setPluginVisibility: defineOperation({
    operationId: "setPluginVisibility",
    path: "/api/ops/v1/plugins/{id}/visibility",
    method: "put",
    tag: "Operations",
    summary: "Hide or restore a plugin",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      body: pluginVisibilityRequestSchema,
      response: visibilityResultSchema,
    },
    responses: { 200: "Updated visibility projection." },
    errors: [400, 401, 404, 409, 422],
  }),
  uploadPluginMedia: defineOperation({
    operationId: "uploadPluginMedia",
    path: "/api/ops/v1/plugins/{id}/media",
    method: "post",
    tag: "Operations",
    summary: "Upload validated plugin media",
    auth: { via: "bearer" },
    // A multipart endpoint reads its own form; the body contract documents the
    // fields without the constructor parsing them as JSON.
    contentType: "multipart/form-data",
    spec: {
      envelope: "operation",
      body: mediaFormSchema,
      response: mediaResultSchema,
    },
    responses: { 201: "Stored media metadata." },
    errors: [400, 401, 404, 422],
  }),
  getOperationsStatus: defineOperation({
    operationId: "getOperationsStatus",
    path: "/api/ops/v1/status",
    method: "get",
    tag: "Operations",
    summary: "Read catalog and Operations API status",
    // Authenticates inside the handler: a rejected token is a warning rather
    // than a failure, so the deployment stays readable while credentials are
    // repaired.
    auth: { via: "optional-bearer" },
    spec: { envelope: "operation", response: operationsStatusSchema },
    responses: { 200: "Operations status envelope. Authentication adds scope details." },
  }),
  getAgentBundle: defineOperation({
    operationId: "getAgentBundle",
    path: "/api/ops/v1/agent-bundle",
    method: "get",
    tag: "Operations",
    summary: "Read the administrator-only agent prompt and configured resources",
    auth: { via: "bearer", scope: null, role: "admin" },
    spec: agentBundleSpec,
    responses: {
      200: "Agent prompt and allowlisted resources. Requires an administrator token.",
    },
    errors: [401, 403],
  }),
  auditOperations: defineOperation({
    operationId: "auditOperations",
    path: "/api/ops/v1/audit",
    method: "get",
    tag: "Operations",
    summary: "Read catalog consistency findings",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      query: (params: URLSearchParams) => ({ scope: params.get("scope") ?? undefined }),
      querySchema: operationAuditQuerySchema,
      response: operationsAuditSchema,
    },
    responses: { 200: "Consistency findings for the selected scope." },
    errors: [400, 401, 404],
  }),
  // Served but absent from the hand-written registry, so it was never
  // published. It repairs the projections the catalog ranks on.
  refreshCatalogScores: defineOperation({
    operationId: "refreshCatalogScores",
    path: "/api/ops/v1/catalog-scores",
    method: "post",
    tag: "Operations",
    summary: "Recompute ranking signals and install readiness for published plugins",
    auth: { via: "bearer" },
    spec: { envelope: "operation", response: catalogScoresSchema },
    responses: {
      200: "Every published plugin's ranking signals and install readiness were recomputed.",
    },
    errors: [401, 403],
  }),
} satisfies Record<string, ApiOperationDefinition>;

export const v1PluginOperationList: readonly ApiOperationDefinition[] =
  Object.values(v1PluginOperations);
