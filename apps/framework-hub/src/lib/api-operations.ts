import { z, type ZodType } from "zod";

import { cliAuthorizationSchema, cliTokenExchangeSchema } from "./auth/cli.contracts";
import {
  localeSchema,
  marketplaceDetailResponseSchema,
  marketplaceListResponseSchema,
  pluginListQuerySchema,
} from "./catalog/contracts";
import {
  observationBatchSchema,
  operationAuditQuerySchema,
  operationMediaMetadataSchema,
  operationReportInputSchema,
  opsPluginListQuerySchema,
  pluginCurationRequestSchema,
  pluginObservationV1Schema,
  pluginVisibilityRequestSchema,
  submissionListQuerySchema,
  submissionResolutionSchema,
} from "./catalog/operations-v1.contracts";

export type ApiOperationTag = "Catalog" | "Operations" | "CLI authorization";
export type ApiOperationMethod = "get" | "post" | "put" | "patch" | "delete";
export type ApiOperationAuthentication = "none" | "bearer" | "optional-bearer";

export type ApiOperationDefinition = {
  readonly operationId: string;
  readonly path: string;
  readonly method: ApiOperationMethod;
  readonly tag: ApiOperationTag;
  readonly summary: string;
  readonly authentication: ApiOperationAuthentication;
  readonly querySchema?: ZodType;
  readonly request?: {
    readonly schema: ZodType;
    readonly contentType?: "application/json" | "multipart/form-data";
  };
  readonly responseSchema?: ZodType;
  readonly responses: Readonly<Record<number, string>>;
  readonly errors?: readonly (400 | 401 | 404 | 409 | 422)[];
};

const genericJsonResponseSchema = z.looseObject({});
const cursorQuerySchema = z.object({
  cursor: z.string().min(1).max(1_000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
const localeQuerySchema = z.object({ locale: localeSchema.default("en") });
const reviewQuerySchema = cursorQuerySchema;
const observationQuerySchema = z.object({ dryRun: z.boolean().default(false) });
const operationMediaRequestSchema = z.object({
  file: z.string().describe("Binary upload"),
  metadata: operationMediaMetadataSchema,
});

export const API_OPERATION_DEFINITIONS = [
  {
    operationId: "listCatalogPlugins",
    path: "/api/plugins",
    method: "get",
    tag: "Catalog",
    summary: "List published plugins",
    authentication: "none",
    querySchema: pluginListQuerySchema,
    responseSchema: marketplaceListResponseSchema,
    responses: { 200: "A cursor-paginated plugin collection." },
    errors: [400],
  },
  {
    operationId: "getCatalogPlugin",
    path: "/api/plugins/{slug}",
    method: "get",
    tag: "Catalog",
    summary: "Get one published plugin",
    authentication: "none",
    querySchema: localeQuerySchema,
    responseSchema: marketplaceDetailResponseSchema,
    responses: {
      200: "Published plugin metadata and source evidence.",
      308: "The plugin has a canonical replacement slug.",
    },
    errors: [404],
  },
  {
    operationId: "listPluginReviews",
    path: "/api/plugins/{slug}/reviews",
    method: "get",
    tag: "Catalog",
    summary: "List published plugin reviews",
    authentication: "none",
    querySchema: reviewQuerySchema,
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "A cursor-paginated collection of public reviews." },
    errors: [404],
  },
  {
    operationId: "getPublisher",
    path: "/api/publishers/{login}",
    method: "get",
    tag: "Catalog",
    summary: "Get a public publisher profile",
    authentication: "none",
    querySchema: localeQuerySchema,
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "Publisher metadata and published plugins." },
    errors: [404],
  },
  {
    operationId: "getHubHealth",
    path: "/api/health",
    method: "get",
    tag: "Catalog",
    summary: "Check Hub storage dependencies",
    authentication: "none",
    responseSchema: genericJsonResponseSchema,
    responses: {
      200: "D1 and R2 dependencies are ready.",
      503: "One or more Hub dependencies are unavailable.",
    },
  },
  {
    operationId: "getOperationsStatus",
    path: "/api/ops/v1/status",
    method: "get",
    tag: "Operations",
    summary: "Read catalog and Operations API status",
    authentication: "optional-bearer",
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "Operations status envelope. Authentication adds scope details." },
  },
  {
    operationId: "listOperationalPlugins",
    path: "/api/ops/v1/plugins",
    method: "get",
    tag: "Operations",
    summary: "List operational plugin projections",
    authentication: "bearer",
    querySchema: opsPluginListQuerySchema,
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "A cursor-paginated operational plugin collection." },
    errors: [400, 401, 404],
  },
  {
    operationId: "getOperationalPlugin",
    path: "/api/ops/v1/plugins/{id}",
    method: "get",
    tag: "Operations",
    summary: "Get one operational plugin projection",
    authentication: "bearer",
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "The complete operational plugin projection." },
    errors: [400, 401, 404],
  },
  {
    operationId: "upsertObservation",
    path: "/api/ops/v1/observations/{observationId}",
    method: "put",
    tag: "Operations",
    summary: "Validate and upsert one source observation",
    authentication: "bearer",
    querySchema: observationQuerySchema,
    request: { schema: pluginObservationV1Schema },
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "Observation validation or merge result." },
    errors: [400, 401, 404, 409, 422],
  },
  {
    operationId: "upsertObservationBatch",
    path: "/api/ops/v1/observations:batch",
    method: "post",
    tag: "Operations",
    summary: "Validate and upsert source observations independently",
    authentication: "bearer",
    request: { schema: observationBatchSchema },
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "Per-observation validation and merge results." },
    errors: [400, 401, 404, 422],
  },
  {
    operationId: "curatePlugin",
    path: "/api/ops/v1/plugins/{id}/curation",
    method: "patch",
    tag: "Operations",
    summary: "Update curated plugin content with revision control",
    authentication: "bearer",
    request: { schema: pluginCurationRequestSchema },
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "Updated curation projection." },
    errors: [400, 401, 404, 409, 422],
  },
  {
    operationId: "setPluginVisibility",
    path: "/api/ops/v1/plugins/{id}/visibility",
    method: "put",
    tag: "Operations",
    summary: "Hide or restore a plugin",
    authentication: "bearer",
    request: { schema: pluginVisibilityRequestSchema },
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "Updated visibility projection." },
    errors: [400, 401, 404, 409, 422],
  },
  {
    operationId: "uploadPluginMedia",
    path: "/api/ops/v1/plugins/{id}/media",
    method: "post",
    tag: "Operations",
    summary: "Upload validated plugin media",
    authentication: "bearer",
    request: { schema: operationMediaRequestSchema, contentType: "multipart/form-data" },
    responseSchema: genericJsonResponseSchema,
    responses: { 201: "Stored media metadata." },
    errors: [400, 401, 404, 422],
  },
  {
    operationId: "listOperationalSubmissions",
    path: "/api/ops/v1/submissions",
    method: "get",
    tag: "Operations",
    summary: "List plugin submissions",
    authentication: "bearer",
    querySchema: submissionListQuerySchema,
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "A cursor-paginated submission collection." },
    errors: [400, 401, 404],
  },
  {
    operationId: "getOperationalSubmission",
    path: "/api/ops/v1/submissions/{id}",
    method: "get",
    tag: "Operations",
    summary: "Get one plugin submission",
    authentication: "bearer",
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "Submission metadata and resolution state." },
    errors: [400, 401, 404],
  },
  {
    operationId: "resolveSubmission",
    path: "/api/ops/v1/submissions/{id}/resolution",
    method: "put",
    tag: "Operations",
    summary: "Resolve a plugin submission",
    authentication: "bearer",
    request: { schema: submissionResolutionSchema },
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "Resolved submission projection." },
    errors: [400, 401, 404, 409, 422],
  },
  {
    operationId: "getLatestOperationsReport",
    path: "/api/ops/v1/reports",
    method: "get",
    tag: "Operations",
    summary: "Read the latest operations report",
    authentication: "bearer",
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "Latest operations report or an empty result." },
    errors: [400, 401, 404],
  },
  {
    operationId: "publishOperationsReport",
    path: "/api/ops/v1/reports",
    method: "post",
    tag: "Operations",
    summary: "Publish an immutable operations report",
    authentication: "bearer",
    request: { schema: operationReportInputSchema },
    responseSchema: genericJsonResponseSchema,
    responses: {
      200: "The report already existed and was unchanged.",
      201: "The report was created.",
    },
    errors: [400, 401, 404, 409, 422],
  },
  {
    operationId: "auditOperations",
    path: "/api/ops/v1/audit",
    method: "get",
    tag: "Operations",
    summary: "Read catalog consistency findings",
    authentication: "bearer",
    querySchema: operationAuditQuerySchema,
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "Consistency findings for the selected scope." },
    errors: [400, 401, 404],
  },
  {
    operationId: "createCliAuthorization",
    path: "/api/cli/authorizations",
    method: "post",
    tag: "CLI authorization",
    summary: "Start a browser-assisted CLI authorization",
    authentication: "none",
    request: { schema: cliAuthorizationSchema },
    responseSchema: genericJsonResponseSchema,
    responses: { 201: "Pending authorization and browser approval URL." },
    errors: [400],
  },
  {
    operationId: "exchangeCliToken",
    path: "/api/cli/token",
    method: "post",
    tag: "CLI authorization",
    summary: "Exchange an approved authorization code for a token",
    authentication: "none",
    request: { schema: cliTokenExchangeSchema },
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "Bearer token and its expiry." },
    errors: [400],
  },
  {
    operationId: "inspectCliToken",
    path: "/api/cli/token",
    method: "get",
    tag: "CLI authorization",
    summary: "Inspect the current bearer token",
    authentication: "bearer",
    responseSchema: genericJsonResponseSchema,
    responses: { 200: "Authenticated user and token metadata." },
    errors: [401],
  },
  {
    operationId: "revokeCliToken",
    path: "/api/cli/token",
    method: "delete",
    tag: "CLI authorization",
    summary: "Revoke the current bearer token",
    authentication: "bearer",
    responses: { 204: "The token was revoked." },
    errors: [401],
  },
] as const satisfies readonly ApiOperationDefinition[];

export function operationsForTag(tag: ApiOperationTag): readonly ApiOperationDefinition[] {
  return API_OPERATION_DEFINITIONS.filter((operation) => operation.tag === tag);
}
