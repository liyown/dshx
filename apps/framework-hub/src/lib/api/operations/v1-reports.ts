import {
  operationReportInputSchema,
  submissionListQuerySchema,
  submissionResolutionSchema,
} from "@becomeopc/dshx-hub-contracts";
import { z } from "zod";

import { defineOperation, type ApiOperationDefinition } from "@/lib/api/operation";
import { listQuery } from "@/lib/api/route";

/**
 * The community queue and the operations log, as the versioned API publishes them.
 *
 * A submission is a raw SQL row, so its projection is declared here rather than
 * spread: the response schema and the service return type have to name the same
 * columns, and an open object would let either drift.
 */

const submissionStatusSchema = z.enum([
  "queued",
  "discovered",
  "qualified",
  "rejected",
  "published",
  "resolved",
]);

/** The resolution exactly as it is stored: the write contract, read back verbatim. */
const storedResolutionSchema = z.object({
  result: z.enum(["accepted", "duplicate", "ignored"]),
  pluginId: z.string().optional(),
  reason: z.string().optional(),
});

const submissionSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  repositoryUrl: z.string(),
  repositoryFullName: z.string(),
  status: submissionStatusSchema,
  sourceHash: z.string().nullable(),
  resolution: storedResolutionSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const submissionPageSchema = z.object({
  items: z.array(submissionSchema),
  nextCursor: z.string().nullable(),
});

const resolutionResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("unchanged"),
    id: z.string(),
    resolution: storedResolutionSchema.nullable(),
  }),
  z.object({
    status: z.literal("updated"),
    id: z.string(),
    resolution: storedResolutionSchema,
    resolvedAt: z.string(),
  }),
]);

const operationReportSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  startedAt: z.string(),
  completedAt: z.string(),
  outcome: z.enum(["completed", "partial"]),
  body: z.object({ en: z.string(), zh: z.string() }),
  createdAt: z.string(),
});

const publishedReportSchema = z.object({
  status: z.enum(["unchanged", "created"]),
  report: operationReportSchema,
});

export const v1ReportOperations = {
  listOperationalSubmissions: defineOperation({
    operationId: "listOperationalSubmissions",
    path: "/api/ops/v1/submissions",
    method: "get",
    tag: "Operations",
    summary: "List plugin submissions",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      query: (params) => ({
        status: listQuery(params, "status"),
        limit: params.has("limit") ? Number(params.get("limit")) : undefined,
        cursor: params.get("cursor") ?? undefined,
      }),
      querySchema: submissionListQuerySchema,
      response: submissionPageSchema,
    },
    responses: { 200: "A cursor-paginated submission collection." },
    errors: [400, 401, 404],
  }),
  getOperationalSubmission: defineOperation({
    operationId: "getOperationalSubmission",
    path: "/api/ops/v1/submissions/{id}",
    method: "get",
    tag: "Operations",
    summary: "Get one plugin submission",
    auth: { via: "bearer" },
    spec: { envelope: "operation", response: submissionSchema },
    responses: { 200: "Submission metadata and resolution state." },
    errors: [400, 401, 404],
  }),
  resolveSubmission: defineOperation({
    operationId: "resolveSubmission",
    path: "/api/ops/v1/submissions/{id}/resolution",
    method: "put",
    tag: "Operations",
    summary: "Resolve a plugin submission",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      body: submissionResolutionSchema,
      response: resolutionResultSchema,
    },
    responses: { 200: "Resolved submission projection." },
    errors: [400, 401, 404, 409, 422],
  }),
  getLatestOperationsReport: defineOperation({
    operationId: "getLatestOperationsReport",
    path: "/api/ops/v1/reports",
    method: "get",
    tag: "Operations",
    summary: "Read the latest operations report",
    auth: { via: "bearer" },
    spec: { envelope: "operation", response: operationReportSchema.nullable() },
    responses: { 200: "Latest operations report or an empty result." },
    errors: [400, 401, 404],
  }),
  publishOperationsReport: defineOperation({
    operationId: "publishOperationsReport",
    path: "/api/ops/v1/reports",
    method: "post",
    tag: "Operations",
    summary: "Publish an immutable operations report",
    auth: { via: "bearer" },
    spec: {
      envelope: "operation",
      body: operationReportInputSchema,
      response: publishedReportSchema,
    },
    // The handler picks the status: a run already published unchanged answers 200.
    responses: {
      200: "The report already existed and was unchanged.",
      201: "The report was created.",
    },
    errors: [400, 401, 404, 409, 422],
  }),
} satisfies Record<string, ApiOperationDefinition>;

export const v1ReportOperationList: readonly ApiOperationDefinition[] =
  Object.values(v1ReportOperations);
