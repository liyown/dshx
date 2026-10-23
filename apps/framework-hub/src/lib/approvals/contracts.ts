import { z } from "zod";

const jsonRecord = z.record(z.string(), z.unknown());

export const approvalKindSchema = z.enum([
  "permanent_access_change",
  "role_change",
  "content_restore",
  "appeal_resolution",
  "maintainer_override",
  "plugin_security_state",
  "catalog_identity_override",
  "force_publication",
  "ops_exception",
]);

export const approvalEffectKindSchema = z.enum([
  "set_user_role",
  "restore_content",
  "set_user_access",
  "set_plugin_lifecycle",
  "set_plugin_maintainer",
  "resolve_catalog_identity",
  "force_publish",
  "resolve_ops_exception",
]);

export const approvalEffectSchema = z.object({
  kind: approvalEffectKindSchema,
  executionMode: z.enum(["server", "agent"]),
  input: jsonRecord,
});

/** The admin ledger filters. `limit` is the only one that needs a numeric contract. */
export const approvalListQuerySchema = z.object({
  status: z.string().max(64).nullish(),
  kind: z.string().max(64).nullish(),
  risk: z.string().max(64).nullish(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const approvalCreateSchema = z.object({
  kind: approvalKindSchema,
  risk: z.enum(["high", "critical"]),
  subjectType: z.enum(["user", "review", "reply", "plugin", "maintainer", "catalog_run"]),
  subjectId: z.string().trim().min(1).max(256),
  runId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(4).max(160),
  summary: z.string().trim().min(12).max(2_000),
  evidence: jsonRecord,
  effect: approvalEffectSchema,
  preconditions: jsonRecord.default({}),
  sourceHash: z.string().min(16).max(128).nullable().optional(),
  policyVersion: z.string().trim().min(1).max(100),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const approvalRevisionSchema = z.object({
  title: z.string().trim().min(4).max(160),
  summary: z.string().trim().min(12).max(2_000),
  evidence: jsonRecord,
  effectInput: jsonRecord,
  preconditions: jsonRecord.default({}),
  sourceHash: z.string().min(16).max(128).nullable().optional(),
  policyVersion: z.string().trim().min(1).max(100),
});

export const approvalDecisionSchema = z
  .object({
    action: z.enum(["approve", "reject", "request_changes"]),
    reason: z.string().trim().max(2_000).nullable().optional(),
  })
  .superRefine((input, context) => {
    if (input.action !== "approve" && !input.reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Rejecting or requesting changes requires a reason",
      });
    }
  });

export const approvalRetrySchema = z.object({
  reason: z.string().trim().max(2_000).nullable().optional(),
});

export const approvalEffectClaimSchema = z.object({
  runId: z.string().uuid().nullable().optional(),
});

export const approvalEffectResultSchema = z
  .object({
    leaseToken: z.string().min(24).max(512),
    status: z.enum(["succeeded", "failed"]),
    output: jsonRecord.nullable().optional(),
    error: z.string().trim().max(4_000).nullable().optional(),
  })
  .superRefine((input, context) => {
    if (input.status === "failed" && !input.error) {
      context.addIssue({
        code: "custom",
        path: ["error"],
        message: "Failed effects need an error",
      });
    }
  });

export type ApprovalCreateInput = z.infer<typeof approvalCreateSchema>;
export type ApprovalRevisionInput = z.infer<typeof approvalRevisionSchema>;
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
export type ApprovalEffectKind = z.infer<typeof approvalEffectKindSchema>;

/**
 * The ledger, as `/api/admin/**` answers it and as the admin pages read it.
 *
 * `kind`, `status` and `effect_kind` stay open strings: the database constrains
 * the status enums, but a new approval kind or effect kind must be able to
 * appear in the ledger before the reader learns about it.
 */
export const approvalListItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  risk: z.enum(["high", "critical"]),
  status: z.enum([
    "pending",
    "changes_requested",
    "approved",
    "rejected",
    "cancelled",
    "expired",
    "superseded",
  ]),
  effect_kind: z.string(),
  effect_status: z.enum([
    "pending",
    "awaiting_agent",
    "running",
    "succeeded",
    "failed",
    "superseded",
  ]),
  subject_type: z.string(),
  subject_id: z.string(),
  title: z.string(),
  summary: z.string(),
  policy_version: z.string(),
  expires_at: z.number(),
  created_at: z.number(),
});

/** `/api/admin/approvals` — the filtered queue and the per-status totals. */
export const approvalPageSchema = z.object({
  items: z.array(approvalListItemSchema),
  counts: z.array(z.object({ status: z.string(), count: z.number() })),
});

/** An approval as its own state machine sees it, without version or effect joins. */
export const approvalRequestSchema = z.object({
  id: z.string(),
  kind: z.string(),
  risk: z.enum(["high", "critical"]),
  status: approvalListItemSchema.shape.status,
  requester_type: z.string(),
  requester_id: z.string().nullable(),
  requester_token_id: z.string().nullable(),
  run_id: z.string().nullable(),
  subject_type: z.string(),
  subject_id: z.string(),
  current_version: z.number(),
  execution_mode: z.enum(["server", "agent"]),
  effect_kind: z.string(),
  effect_status: approvalListItemSchema.shape.effect_status,
  idempotency_key: z.string(),
  expires_at: z.number(),
  decided_by_user_id: z.string().nullable(),
  decided_at: z.number().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
});

/** The version a decision rests on, with its JSON columns decoded and its effect previewed. */
export const approvalVersionViewSchema = z.object({
  version: z.number(),
  title: z.string(),
  summary: z.string(),
  evidence: z.unknown(),
  effectInput: z.unknown(),
  preconditions: z.unknown(),
  preview: z.array(z.object({ label: z.string(), value: z.string() })),
  source_hash: z.string(),
  policy_version: z.string(),
  created_at: z.number(),
});

const approvalEffectRowSchema = z.object({
  request_id: z.string(),
  version: z.number(),
  effect_kind: z.string(),
  execution_mode: z.enum(["server", "agent"]),
  status: approvalListItemSchema.shape.effect_status,
  attempt_count: z.number(),
  lease_expires_at: z.number().nullable(),
  last_error: z.string().nullable(),
  updated_at: z.number(),
});

/**
 * The audit rows are rendered as raw JSON, so the contract keeps every column
 * the row carries rather than naming the ones today's pages happen to print.
 */
const approvalAuditRowSchema = z.looseObject({});

/** `/api/admin/approvals/$id` — everything the decision page shows. */
export const approvalDetailSchema = z.object({
  request: approvalRequestSchema,
  current: approvalVersionViewSchema,
  effect: approvalEffectRowSchema,
  versions: z.array(approvalAuditRowSchema),
  decisions: z.array(approvalAuditRowSchema),
  events: z.array(approvalAuditRowSchema),
  attempts: z.array(approvalAuditRowSchema),
});

export type ApprovalListItem = z.infer<typeof approvalListItemSchema>;
export type ApprovalPage = z.infer<typeof approvalPageSchema>;
export type ApprovalDetail = z.infer<typeof approvalDetailSchema>;
