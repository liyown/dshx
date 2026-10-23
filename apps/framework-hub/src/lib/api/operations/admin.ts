import { z } from "zod";

import { defineOperation, type ApiOperationDefinition } from "@/lib/api/operation";
import {
  approvalCreateSchema,
  approvalEffectClaimSchema,
  approvalEffectKindSchema,
  approvalEffectResultSchema,
  approvalListItemSchema,
  approvalRevisionSchema,
} from "@/lib/approvals/contracts";
import { moderationActionSchema, userRoleSchema } from "@/lib/catalog/contracts";

/**
 * Approvals and moderation.
 *
 * Neither family was ever described in `api-operations.ts`, so both were served
 * but unpublished. An approval is queued rather than applied: the requester
 * creates it, an administrator decides it, and — for an agent-executed effect —
 * the agent claims a lease and reports the result. Moderation reuses the same
 * queue for the four actions that cannot be taken back.
 */

/**
 * What a requester sees of its own approval.
 *
 * The list, the creation, the read and the revision answer this same shape, so
 * a caller polls with the parser it created with. The administrator ledger in
 * `contracts.ts` is a different view and stays out of this family.
 */
const requesterApprovalSchema = z.object({
  id: z.string(),
  kind: z.string(),
  risk: z.enum(["high", "critical"]),
  status: approvalListItemSchema.shape.status,
  effectStatus: approvalListItemSchema.shape.effect_status,
  currentVersion: z.number().int(),
  title: z.string(),
  summary: z.string(),
  expiresAt: z.string(),
  executionMode: z.enum(["server", "agent"]),
  effectKind: approvalEffectKindSchema,
  leaseExpiresAt: z.string().nullable(),
  version: z.number(),
});

/**
 * The list answers the same fields as one request, but `requesterApprovalList`
 * erases its SQL projection to `Record<string, unknown>` on the way out, so
 * this endpoint cannot honestly publish the field names until that row type is
 * named at the store. Kept open rather than guessed.
 */
const actorApprovalListSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
});

/** A request that was filed instead of applied, which is every role change. */
const approvalEnqueuedSchema = z.object({
  approval: requesterApprovalSchema,
  requiresApproval: z.literal(true),
});

/**
 * The lease an agent receives when it claims an effect.
 *
 * `input` stays an open record because it is the effect's own input, validated
 * against the effect registry rather than against a shape this endpoint knows.
 */
const agentEffectLeaseSchema = z.object({
  approvalId: z.string(),
  leaseToken: z.string(),
  leaseExpiresAt: z.string(),
  attempt: z.number().int(),
  effectKind: approvalEffectKindSchema,
  runId: z.string().nullable(),
  input: z.record(z.string(), z.unknown()),
});

/** A completed attempt. A replay of the same lease reports `duplicate`. */
const agentEffectOutcomeSchema = z.object({
  approvalId: z.string(),
  status: z.enum(["succeeded", "failed"]),
  duplicate: z.boolean(),
});

const moderationQueueItemSchema = z.object({
  targetType: z.enum(["plugin", "review", "reply", "profile", "collection"]),
  targetId: z.string(),
  reportIds: z.array(z.string()),
  reports: z.array(
    z.object({
      id: z.string(),
      reason: z.string(),
      details: z.string().nullable(),
      reporterUserId: z.string(),
      createdAt: z.number(),
    }),
  ),
  reportCount: z.number().int(),
  oldestReportedAt: z.string(),
  content: z.object({
    body: z.string().nullable(),
    locale: z.string().nullable(),
    status: z.string(),
  }),
  author: z.object({
    userId: z.string().nullable(),
    githubLogin: z.string().nullable(),
    status: z.string().nullable(),
    priorRestrictions30d: z.number().int(),
  }),
  plugin: z.object({ id: z.string(), slug: z.string().nullable() }).nullable(),
});

const moderationQueueSchema = z.object({ items: z.array(moderationQueueItemSchema) });

/**
 * An action that was applied. `metadata` keeps the caller's own keys because
 * the audit row preserves them, so the record is open on purpose.
 */
const moderationActionAppliedSchema = z.object({
  id: z.string(),
  actorType: z.literal("api_token"),
  actorId: z.string(),
  action: z.enum(["hide", "restore", "dismiss", "restrict", "unrestrict", "ban", "unban"]),
  targetType: z.enum(["plugin", "review", "reply", "profile", "collection", "user"]),
  targetId: z.string(),
  reason: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export const adminOperations = {
  listActorApprovals: defineOperation({
    operationId: "listActorApprovals",
    path: "/api/ops/approvals",
    method: "get",
    tag: "Approvals",
    summary: "List the approvals this token requested, newest first",
    auth: { via: "bearer", scope: "approvals:write" },
    spec: { response: actorApprovalListSchema },
    responses: { 200: "The requests this token filed, at most one hundred." },
    errors: [401, 403],
  }),
  createApproval: defineOperation({
    operationId: "createApproval",
    path: "/api/ops/approvals",
    method: "post",
    tag: "Approvals",
    summary: "File an approval request for a high-risk or critical effect",
    auth: { via: "bearer", scope: "approvals:write" },
    spec: { body: approvalCreateSchema, status: 201, response: requesterApprovalSchema },
    responses: { 201: "The filed request and the version it rests on." },
    errors: [400, 401, 403, 404, 409, 422],
  }),
  getRequesterApproval: defineOperation({
    operationId: "getRequesterApproval",
    path: "/api/ops/approvals/{id}",
    method: "get",
    tag: "Approvals",
    summary: "Read one approval as its requester sees it",
    auth: { via: "bearer", scope: "approvals:write" },
    spec: { response: requesterApprovalSchema },
    responses: { 200: "The request, its current version and its lease state." },
    errors: [401, 403, 404],
  }),
  reviseApproval: defineOperation({
    operationId: "reviseApproval",
    path: "/api/ops/approvals/{id}/revisions",
    method: "post",
    tag: "Approvals",
    summary: "Submit a new version of an approval whose changes were requested",
    auth: { via: "bearer", scope: "approvals:write" },
    spec: { body: approvalRevisionSchema, response: requesterApprovalSchema },
    responses: { 200: "The revised request, reset to pending on its new version." },
    errors: [400, 401, 403, 404, 409, 422],
  }),
  claimAgentEffect: defineOperation({
    operationId: "claimAgentEffect",
    path: "/api/ops/approvals/{id}/effects/claim",
    method: "post",
    tag: "Approvals",
    summary: "Claim the effect of an approved agent-mode request",
    auth: { via: "bearer", scope: "approvals:write" },
    spec: { body: approvalEffectClaimSchema, response: agentEffectLeaseSchema },
    responses: { 200: "A lease over the effect, its input and its expiry." },
    errors: [400, 401, 403, 404, 409, 422],
  }),
  completeAgentEffect: defineOperation({
    operationId: "completeAgentEffect",
    path: "/api/ops/approvals/{id}/effects/result",
    method: "post",
    tag: "Approvals",
    summary: "Report the outcome of a claimed agent effect",
    auth: { via: "bearer", scope: "approvals:write" },
    spec: { body: approvalEffectResultSchema, response: agentEffectOutcomeSchema },
    responses: { 200: "The recorded outcome; a repeated lease reports duplicate." },
    errors: [400, 401, 403, 404, 409, 422],
  }),
  listModerationQueue: defineOperation({
    operationId: "listModerationQueue",
    path: "/api/ops/moderation/queue",
    method: "get",
    tag: "Moderation",
    summary: "List open report targets, oldest report first",
    auth: { via: "bearer", scope: "moderation:write" },
    spec: { response: moderationQueueSchema },
    responses: { 200: "Grouped report targets with their content and author state." },
    errors: [401, 403],
  }),
  applyModerationAction: defineOperation({
    operationId: "applyModerationAction",
    path: "/api/ops/moderation/actions",
    method: "post",
    tag: "Moderation",
    summary: "Apply a moderation action, or queue the approval it requires",
    auth: { via: "bearer", scope: "moderation:write", role: "moderator" },
    // The handler answers a Response of its own because the status depends on
    // the action: the four access-changing actions answer 202 with the approval
    // they filed, everything else answers 201 with the action it applied.
    spec: { body: moderationActionSchema, status: 201, response: moderationActionAppliedSchema },
    responses: {
      201: "The action was applied and recorded.",
      202: "The action is approval-gated: the filed request is returned instead.",
    },
    errors: [400, 401, 403, 404, 409, 422],
  }),
  setUserRole: defineOperation({
    operationId: "setUserRole",
    path: "/api/ops/users/{id}/role",
    method: "put",
    tag: "Moderation",
    summary: "File a critical approval to change a user's role",
    auth: { via: "bearer", scope: "users:write", role: "admin" },
    // A role change is never applied by this endpoint; it only files the
    // request an administrator has to decide.
    spec: { body: userRoleSchema, status: 202, response: approvalEnqueuedSchema },
    responses: { 202: "The role change was queued as an approval." },
    errors: [400, 401, 403, 404, 409, 422],
  }),
} satisfies Record<string, ApiOperationDefinition>;

export const adminOperationList: readonly ApiOperationDefinition[] = Object.values(adminOperations);
