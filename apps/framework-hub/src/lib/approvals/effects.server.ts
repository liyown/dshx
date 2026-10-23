import { z } from "zod";
import type { BatchItem } from "drizzle-orm/batch";

import {
  contentStatusStatements,
  moderationRecordStatement,
  userAccessStatements,
} from "@/lib/community/enforcement.server";
import type { ApprovalEffectKind } from "./contracts";
import { assertSubjectPreconditions } from "./subject";
import type { Database } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";
import { HttpError } from "@/lib/http";

type EffectDefinition = {
  executionMode: "server" | "agent";
  inputSchema: z.ZodType<Record<string, unknown>>;
  preconditionsSchema: z.ZodType<Record<string, unknown>>;
  preview: (input: Record<string, unknown>) => Array<{ label: string; value: string }>;
  checkPreconditions: (
    state: Record<string, unknown>,
    preconditions: Record<string, unknown>,
    input: Record<string, unknown>,
  ) => void;
  prepare?: (
    binding: Database,
    input: Record<string, unknown>,
    actorUserId: string,
    reason: string,
  ) => BatchItem<"sqlite">[];
};

const userRoleInput = z.object({
  userId: z.string().min(1).max(128),
  role: z.enum(["member", "operator", "moderator", "admin"]),
});

const restoreContentInput = z.object({
  targetType: z.enum(["review", "reply"]),
  targetId: z.string().min(1).max(128),
});

const userAccessInput = z.object({
  userId: z.string().min(1).max(128),
  action: z.enum(["ban", "unban", "unrestrict"]),
  reason: z.string().trim().min(3).max(1_000),
});

const pluginLifecycleInput = z.object({
  pluginId: z.string().min(1).max(128),
  lifecycleStatus: z.enum(["active", "unmaintained", "unavailable", "suspended"]),
});

const maintainerInput = z.object({
  pluginId: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
  action: z.enum(["grant", "revoke"]),
  role: z.enum(["owner", "maintainer"]).default("maintainer"),
});

const agentInput = z.record(z.string(), z.unknown());
const statePreconditions = z.record(z.string().min(1), z.unknown());

function exactStateCheck(state: Record<string, unknown>, preconditions: Record<string, unknown>) {
  assertSubjectPreconditions(state, preconditions);
}

const definitions: Record<ApprovalEffectKind, EffectDefinition> = {
  set_user_role: {
    executionMode: "server",
    inputSchema: userRoleInput,
    preconditionsSchema: statePreconditions,
    checkPreconditions: exactStateCheck,
    preview: (input) => [
      { label: "User", value: String(input["userId"]) },
      { label: "New role", value: String(input["role"]) },
    ],
    prepare: (binding, raw) => {
      const input = userRoleInput.parse(raw);
      return [
        binding.run(
          parameterizedSql("update user_profiles set role=?,updated_at=? where user_id=?", [
            input.role,
            Date.now(),
            input.userId,
          ]),
        ),
      ];
    },
  },
  restore_content: {
    executionMode: "server",
    inputSchema: restoreContentInput,
    preconditionsSchema: statePreconditions,
    checkPreconditions: (state, preconditions) => {
      exactStateCheck(state, preconditions);
      if (state["status"] !== "hidden")
        throw new HttpError(
          409,
          "Only moderation-hidden content can be restored",
          "effect_precondition_failed",
        );
    },
    preview: (input) => [
      { label: "Content", value: `${String(input["targetType"])}:${String(input["targetId"])}` },
      { label: "New status", value: "published" },
    ],
    prepare: (binding, raw, actorUserId, reason) => {
      const input = restoreContentInput.parse(raw);
      const now = Date.now();
      return [
        ...contentStatusStatements(binding, input.targetType, input.targetId, "published", now),
        moderationRecordStatement(binding, {
          actor: { type: "user", id: actorUserId },
          action: "restore",
          targetType: input.targetType,
          targetId: input.targetId,
          reason,
          metadata: { source: "approval" },
          now,
        }),
      ];
    },
  },
  set_user_access: {
    executionMode: "server",
    inputSchema: userAccessInput,
    preconditionsSchema: statePreconditions,
    checkPreconditions: (state, preconditions, raw) => {
      exactStateCheck(state, preconditions);
      const input = userAccessInput.parse(raw);
      const status = state["status"];
      if (input.action === "unban" && status !== "banned")
        throw new HttpError(409, "User is not banned", "effect_precondition_failed");
      if (input.action === "unrestrict" && status !== "restricted")
        throw new HttpError(409, "User is not restricted", "effect_precondition_failed");
    },
    preview: (input) => [
      { label: "User", value: String(input["userId"]) },
      { label: "Access change", value: String(input["action"]) },
    ],
    prepare: (binding, raw, actorUserId) => {
      const input = userAccessInput.parse(raw);
      const now = Date.now();
      return [
        ...userAccessStatements(
          binding,
          {
            userId: input.userId,
            access: input.action,
            reason: input.reason,
            expiresAt: null,
            actor: { type: "user", id: actorUserId },
          },
          now,
        ),
        moderationRecordStatement(binding, {
          actor: { type: "user", id: actorUserId },
          action: input.action,
          targetType: "user",
          targetId: input.userId,
          reason: input.reason,
          metadata: { source: "approval" },
          now,
        }),
      ];
    },
  },
  set_plugin_lifecycle: {
    executionMode: "server",
    inputSchema: pluginLifecycleInput,
    preconditionsSchema: statePreconditions,
    checkPreconditions: exactStateCheck,
    preview: (input) => [
      { label: "Plugin", value: String(input["pluginId"]) },
      { label: "Lifecycle", value: String(input["lifecycleStatus"]) },
    ],
    prepare: (binding, raw) => {
      const input = pluginLifecycleInput.parse(raw);
      return [
        binding.run(
          parameterizedSql("update plugins set lifecycle_status=?,updated_at=? where id=?", [
            input.lifecycleStatus,
            Date.now(),
            input.pluginId,
          ]),
        ),
      ];
    },
  },
  set_plugin_maintainer: {
    executionMode: "server",
    inputSchema: maintainerInput,
    preconditionsSchema: statePreconditions,
    checkPreconditions: (state, preconditions, raw) => {
      exactStateCheck(state, preconditions);
      const input = maintainerInput.parse(raw);
      if (input.action === "revoke" && (state["missing"] === true || state["revoked_at"] != null))
        throw new HttpError(409, "Maintainer is not active", "effect_precondition_failed");
    },
    preview: (input) => [
      { label: "Plugin", value: String(input["pluginId"]) },
      { label: "Maintainer", value: String(input["userId"]) },
      { label: "Change", value: String(input["action"]) },
    ],
    prepare: (binding, raw) => {
      const input = maintainerInput.parse(raw);
      const now = Date.now();
      return input.action === "revoke"
        ? [
            binding.run(
              parameterizedSql(
                "update plugin_maintainers set revoked_at=? where plugin_id=? and user_id=? and revoked_at is null",
                [now, input.pluginId, input.userId],
              ),
            ),
          ]
        : [
            binding.run(
              parameterizedSql(
                `insert into plugin_maintainers(plugin_id,user_id,role,source,claim_id,added_at,revoked_at)
                 values(?,?,?,?,?,?,null)
                 on conflict(plugin_id,user_id) do update set role=excluded.role,source='manual',revoked_at=null`,
                [input.pluginId, input.userId, input.role, "manual", null, now],
              ),
            ),
          ];
    },
  },
  resolve_catalog_identity: {
    executionMode: "agent",
    inputSchema: agentInput,
    preconditionsSchema: statePreconditions,
    checkPreconditions: exactStateCheck,
    preview: () => [{ label: "Executor", value: "Authorized catalog Agent" }],
  },
  force_publish: {
    executionMode: "agent",
    inputSchema: agentInput,
    preconditionsSchema: statePreconditions,
    checkPreconditions: exactStateCheck,
    preview: () => [{ label: "Executor", value: "Authorized catalog Agent" }],
  },
  resolve_ops_exception: {
    executionMode: "agent",
    inputSchema: agentInput,
    preconditionsSchema: statePreconditions,
    checkPreconditions: exactStateCheck,
    preview: () => [{ label: "Executor", value: "Requesting Agent" }],
  },
};

export function registeredEffect(kind: ApprovalEffectKind) {
  return definitions[kind];
}

export function validateRegisteredEffect(
  kind: ApprovalEffectKind,
  executionMode: "server" | "agent",
  input: Record<string, unknown>,
) {
  const definition = definitions[kind];
  if (definition.executionMode !== executionMode) {
    throw new HttpError(
      422,
      `${kind} must use ${definition.executionMode} execution`,
      "invalid_effect_mode",
    );
  }
  const parsed = definition.inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(
      422,
      parsed.error.issues.map((issue) => issue.message).join("; "),
      "invalid_effect_input",
    );
  }
  return { definition, input: parsed.data };
}

export function validateRegisteredPreconditions(
  kind: ApprovalEffectKind,
  state: Record<string, unknown>,
  preconditions: Record<string, unknown>,
  input: Record<string, unknown>,
) {
  const definition = definitions[kind];
  const parsed = definition.preconditionsSchema.safeParse(preconditions);
  if (!parsed.success) {
    throw new HttpError(
      422,
      parsed.error.issues.map((issue) => issue.message).join("; "),
      "invalid_effect_precondition",
    );
  }
  definition.checkPreconditions(state, parsed.data, input);
  return parsed.data;
}

/**
 * An effect may only name the subject it was filed against.
 *
 * The subject is what the administrator reviewed and what the source hash
 * fingerprints; an effect that reaches a different user or plugin would apply
 * an approval to something nobody looked at.
 */
export function assertEffectSubject(
  kind: ApprovalEffectKind,
  input: Record<string, unknown>,
  subjectType: string,
  subjectId: string,
): void {
  const mismatch = (message: string) => new HttpError(422, message, "effect_subject_mismatch");
  if (
    (kind === "set_user_role" || kind === "set_user_access") &&
    (subjectType !== "user" || input["userId"] !== subjectId)
  )
    throw mismatch("User effect must match its approval subject");
  if (
    kind === "restore_content" &&
    (input["targetType"] !== subjectType || input["targetId"] !== subjectId)
  )
    throw mismatch("Restore effect must match its approval subject");
  if (
    kind === "set_plugin_lifecycle" &&
    (subjectType !== "plugin" || input["pluginId"] !== subjectId)
  )
    throw mismatch("Plugin effect must match its approval subject");
  if (
    kind === "set_plugin_maintainer" &&
    (subjectType !== "maintainer" ||
      `${String(input["pluginId"])}:${String(input["userId"])}` !== subjectId)
  )
    throw mismatch("Maintainer effect must match its approval subject");
}
