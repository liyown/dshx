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
