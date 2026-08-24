import { z } from "zod";

import type { ApprovalEffectKind } from "./contracts";
import { HttpError, uuid } from "@/lib/http";

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
    binding: D1Database,
    input: Record<string, unknown>,
    actorUserId: string,
    reason: string,
  ) => D1PreparedStatement[];
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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function checkExactState(state: Record<string, unknown>, preconditions: Record<string, unknown>) {
  for (const [key, expected] of Object.entries(preconditions)) {
    if (!Object.prototype.hasOwnProperty.call(state, key)) {
      throw new HttpError(
        422,
        `Unknown subject precondition: ${key}`,
        "invalid_effect_precondition",
      );
    }
    if (stableJson(state[key]) !== stableJson(expected)) {
      throw new HttpError(
        409,
        `Approval precondition no longer holds: ${key}`,
        "effect_precondition_failed",
      );
    }
  }
}

function exactStateCheck(state: Record<string, unknown>, preconditions: Record<string, unknown>) {
  checkExactState(state, preconditions);
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
        binding
          .prepare("update user_profiles set role=?,updated_at=? where user_id=?")
          .bind(input.role, Date.now(), input.userId),
      ];
    },
  },
  restore_content: {
    executionMode: "server",
    inputSchema: restoreContentInput,
    preconditionsSchema: statePreconditions,
    checkPreconditions: (state, preconditions) => {
      checkExactState(state, preconditions);
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
      const table = input.targetType === "review" ? "plugin_reviews" : "review_replies";
      const now = Date.now();
      return [
        binding
          .prepare(`update ${table} set status='published',updated_at=? where id=?`)
          .bind(now, input.targetId),
        binding
          .prepare(
            `insert into moderation_actions(id,actor_type,actor_id,action,target_type,target_id,reason,metadata_json,created_at)
             values(?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            uuid(),
            "user",
            actorUserId,
            "restore",
            input.targetType,
            input.targetId,
            reason,
            JSON.stringify({ source: "approval" }),
            now,
          ),
      ];
    },
  },
  set_user_access: {
    executionMode: "server",
    inputSchema: userAccessInput,
    preconditionsSchema: statePreconditions,
    checkPreconditions: (state, preconditions, raw) => {
      checkExactState(state, preconditions);
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
      if (input.action === "ban") {
        return [
          binding
            .prepare(
              `insert into user_restrictions(id,user_id,kind,reason,starts_at,expires_at,created_by_actor_type,created_by_actor_id)
               values(?,?,?,?,?,?,?,?)`,
            )
            .bind(uuid(), input.userId, "ban", input.reason, now, null, "user", actorUserId),
          binding
            .prepare("update user_profiles set status='banned',updated_at=? where user_id=?")
            .bind(now, input.userId),
          binding
            .prepare(
              `insert into moderation_actions(id,actor_type,actor_id,action,target_type,target_id,reason,metadata_json,created_at)
               values(?,?,?,?,?,?,?,?,?)`,
            )
            .bind(
              uuid(),
              "user",
              actorUserId,
              "ban",
              "user",
              input.userId,
              input.reason,
              JSON.stringify({ source: "approval" }),
              now,
            ),
        ];
      }
      return [
        binding
          .prepare(
            "update user_restrictions set revoked_at=? where user_id=? and revoked_at is null",
          )
          .bind(now, input.userId),
        binding
          .prepare("update user_profiles set status='active',updated_at=? where user_id=?")
          .bind(now, input.userId),
        binding
          .prepare(
            `insert into moderation_actions(id,actor_type,actor_id,action,target_type,target_id,reason,metadata_json,created_at)
             values(?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            uuid(),
            "user",
            actorUserId,
            input.action,
            "user",
            input.userId,
            input.reason,
            JSON.stringify({ source: "approval" }),
            now,
          ),
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
        binding
          .prepare("update plugins set lifecycle_status=?,updated_at=? where id=?")
          .bind(input.lifecycleStatus, Date.now(), input.pluginId),
      ];
    },
  },
  set_plugin_maintainer: {
    executionMode: "server",
    inputSchema: maintainerInput,
    preconditionsSchema: statePreconditions,
    checkPreconditions: (state, preconditions, raw) => {
      checkExactState(state, preconditions);
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
            binding
              .prepare(
                "update plugin_maintainers set revoked_at=? where plugin_id=? and user_id=? and revoked_at is null",
              )
              .bind(now, input.pluginId, input.userId),
          ]
        : [
            binding
              .prepare(
                `insert into plugin_maintainers(plugin_id,user_id,role,source,claim_id,added_at,revoked_at)
                 values(?,?,?,?,?,?,null)
                 on conflict(plugin_id,user_id) do update set role=excluded.role,source='manual',revoked_at=null`,
              )
              .bind(input.pluginId, input.userId, input.role, "manual", null, now),
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
