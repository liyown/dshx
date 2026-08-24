import type {
  ApprovalCreateInput,
  ApprovalDecisionInput,
  ApprovalRevisionInput,
} from "./contracts";
import {
  registeredEffect,
  validateRegisteredEffect,
  validateRegisteredPreconditions,
} from "./effects.server";
import { randomToken, sha256 } from "@/lib/auth/tokens.server";
import { HttpError, uuid } from "@/lib/http";

type TokenActor = {
  token: { id: string; userId: string };
  profile: { role: string };
};

type RequestRow = {
  id: string;
  kind: string;
  risk: "high" | "critical";
  status:
    | "pending"
    | "changes_requested"
    | "approved"
    | "rejected"
    | "cancelled"
    | "expired"
    | "superseded";
  requester_type: "user" | "api_token" | "system";
  requester_id: string | null;
  requester_token_id: string | null;
  run_id: string | null;
  subject_type: string;
  subject_id: string;
  current_version: number;
  execution_mode: "server" | "agent";
  effect_kind: Parameters<typeof registeredEffect>[0];
  effect_status: string;
  idempotency_key: string;
  expires_at: number;
  decided_by_user_id: string | null;
  decided_at: number | null;
  created_at: number;
  updated_at: number;
};

type VersionRow = {
  request_id: string;
  version: number;
  title: string;
  summary: string;
  evidence_json: string;
  effect_input_json: string;
  preconditions_json: string;
  source_hash: string;
  policy_version: string;
  created_by_type: string;
  created_by_id: string | null;
  created_at: number;
};

type EffectRow = {
  request_id: string;
  version: number;
  effect_kind: Parameters<typeof registeredEffect>[0];
  execution_mode: "server" | "agent";
  status: "pending" | "awaiting_agent" | "running" | "succeeded" | "failed" | "superseded";
  attempt_count: number;
  lease_token_hash: string | null;
  leased_to_token_id: string | null;
  lease_expires_at: number | null;
  last_error: string | null;
  updated_at: number;
};

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

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

async function subjectState(binding: D1Database, type: string, id: string) {
  if (type === "user") {
    return binding
      .prepare(
        "select user_id id,role,status,github_login,updated_at from user_profiles where user_id=?",
      )
      .bind(id)
      .first<Record<string, unknown>>();
  }
  if (type === "review") {
    return binding
      .prepare(
        "select id,plugin_id,user_id,status,rating,updated_at from plugin_reviews where id=?",
      )
      .bind(id)
      .first<Record<string, unknown>>();
  }
  if (type === "reply") {
    return binding
      .prepare("select id,review_id,user_id,status,updated_at from review_replies where id=?")
      .bind(id)
      .first<Record<string, unknown>>();
  }
  if (type === "plugin") {
    return binding
      .prepare(
        "select id,identity_key,slug,status,lifecycle_status,verification_status,updated_at from plugins where id=?",
      )
      .bind(id)
      .first<Record<string, unknown>>();
  }
  if (type === "maintainer") {
    const [pluginId, userId] = id.split(":", 2);
    if (!pluginId || !userId) return null;
    return (
      (await binding
        .prepare(
          "select plugin_id,user_id,role,source,added_at,revoked_at from plugin_maintainers where plugin_id=? and user_id=?",
        )
        .bind(pluginId, userId)
        .first<Record<string, unknown>>()) ?? {
        plugin_id: pluginId,
        user_id: userId,
        missing: true,
      }
    );
  }
  if (type === "catalog_run") {
    return binding
      .prepare(
        "select id,status,mode,expected_items,received_items,accepted_items,rejected_items,payload_hash from catalog_sync_runs where id=?",
      )
      .bind(id)
      .first<Record<string, unknown>>();
  }
  return null;
}

async function currentSourceHash(binding: D1Database, type: string, id: string) {
  const state = await subjectState(binding, type, id);
  if (!state) throw new HttpError(404, "Approval subject not found", "approval_subject_not_found");
  return { state, hash: await sha256(stableJson(state)) };
}

function validateEffectSubject(
  kind: RequestRow["effect_kind"],
  effect: Record<string, unknown>,
  subjectType: string,
  subjectId: string,
) {
  if (
    ["set_user_role", "set_user_access"].includes(kind) &&
    (subjectType !== "user" || effect["userId"] !== subjectId)
  ) {
    throw new HttpError(
      422,
      "User effect must match its approval subject",
      "effect_subject_mismatch",
    );
  }
  if (
    kind === "restore_content" &&
    (effect["targetType"] !== subjectType || effect["targetId"] !== subjectId)
  ) {
    throw new HttpError(
      422,
      "Restore effect must match its approval subject",
      "effect_subject_mismatch",
    );
  }
  if (
    kind === "set_plugin_lifecycle" &&
    (subjectType !== "plugin" || effect["pluginId"] !== subjectId)
  ) {
    throw new HttpError(
      422,
      "Plugin effect must match its approval subject",
      "effect_subject_mismatch",
    );
  }
  if (
    kind === "set_plugin_maintainer" &&
    (subjectType !== "maintainer" ||
      `${String(effect["pluginId"])}:${String(effect["userId"])}` !== subjectId)
  ) {
    throw new HttpError(
      422,
      "Maintainer effect must match its approval subject",
      "effect_subject_mismatch",
    );
  }
}

async function requestRow(binding: D1Database, id: string) {
  const row = await binding
    .prepare("select * from approval_requests where id=?")
    .bind(id)
    .first<RequestRow>();
  if (!row) throw new HttpError(404, "Approval request not found", "approval_not_found");
  if (["pending", "changes_requested"].includes(row.status) && row.expires_at <= Date.now()) {
    const now = Date.now();
    await binding.batch([
      binding
        .prepare(
          "update approval_requests set status='expired',effect_status='superseded',updated_at=? where id=? and status in ('pending','changes_requested')",
        )
        .bind(now, id),
      binding
        .prepare("update approval_effects set status='superseded',updated_at=? where request_id=?")
        .bind(now, id),
      binding
        .prepare(
          "insert into approval_events(id,request_id,kind,actor_type,actor_id,payload_json,created_at) values(?,?,?,?,?,?,?)",
        )
        .bind(uuid(), id, "expired", "system", null, "{}", now),
    ]);
    return { ...row, status: "expired" as const, effect_status: "superseded" };
  }
  return row;
}

async function versionRow(binding: D1Database, request: RequestRow) {
  const row = await binding
    .prepare("select * from approval_request_versions where request_id=? and version=?")
    .bind(request.id, request.current_version)
    .first<VersionRow>();
  if (!row) throw new HttpError(500, "Approval version is missing", "approval_version_missing");
  return row;
}

async function effectRow(binding: D1Database, requestId: string) {
  const row = await binding
    .prepare("select * from approval_effects where request_id=?")
    .bind(requestId)
    .first<EffectRow>();
  if (!row) throw new HttpError(500, "Approval effect is missing", "approval_effect_missing");
  return row;
}

function requesterNotification(
  binding: D1Database,
  request: RequestRow,
  kind: string,
  payload: Record<string, unknown>,
) {
  if (request.requester_type === "user" && request.requester_id) {
    return binding
      .prepare(
        "insert into notification_events(id,user_id,kind,actor_user_id,subject_type,subject_id,payload_json,created_at) values(?,?,?,?,?,?,?,?)",
      )
      .bind(
        uuid(),
        request.requester_id,
        kind,
        null,
        "approval",
        request.id,
        JSON.stringify(payload),
        Date.now(),
      );
  }
  return binding
    .prepare(
      `insert into notification_events(id,user_id,kind,actor_user_id,subject_type,subject_id,payload_json,created_at)
       select ?,user_id,?,null,'approval',?,?,? from api_tokens where id=?`,
    )
    .bind(
      uuid(),
      kind,
      request.id,
      JSON.stringify(payload),
      Date.now(),
      request.requester_token_id,
    );
}

export async function createApproval(
  binding: D1Database,
  actor: TokenActor,
  input: ApprovalCreateInput,
) {
  const existing = await binding
    .prepare("select id from approval_requests where idempotency_key=?")
    .bind(input.idempotencyKey)
    .first<{ id: string }>();
  if (existing) return getApproval(binding, existing.id, actor, false);

  validateEffectSubject(input.effect.kind, input.effect.input, input.subjectType, input.subjectId);
  const validated = validateRegisteredEffect(
    input.effect.kind,
    input.effect.executionMode,
    input.effect.input,
  );
  const source = await currentSourceHash(binding, input.subjectType, input.subjectId);
  const preconditions = validateRegisteredPreconditions(
    input.effect.kind,
    source.state,
    input.preconditions,
    validated.input,
  );
  if (input.sourceHash && input.sourceHash !== source.hash) {
    throw new HttpError(409, "Approval subject changed before creation", "approval_source_changed");
  }

  const id = uuid();
  const now = Date.now();
  const expiresAt = now + 7 * 86_400_000;
  await binding.batch([
    binding
      .prepare(
        `insert into approval_requests(
          id,kind,risk,status,requester_type,requester_id,requester_token_id,run_id,
          subject_type,subject_id,current_version,execution_mode,effect_kind,effect_status,
          idempotency_key,expires_at,created_at,updated_at
        ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        input.kind,
        input.risk,
        "pending",
        "api_token",
        actor.token.userId,
        actor.token.id,
        input.runId ?? null,
        input.subjectType,
        input.subjectId,
        1,
        input.effect.executionMode,
        input.effect.kind,
        "pending",
        input.idempotencyKey,
        expiresAt,
        now,
        now,
      ),
    binding
      .prepare(
        `insert into approval_request_versions(
          request_id,version,title,summary,evidence_json,effect_input_json,preconditions_json,
          source_hash,policy_version,created_by_type,created_by_id,created_at
        ) values(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        1,
        input.title,
        input.summary,
        JSON.stringify(input.evidence),
        JSON.stringify(validated.input),
        JSON.stringify(preconditions),
        source.hash,
        input.policyVersion,
        "api_token",
        actor.token.id,
        now,
      ),
    binding
      .prepare(
        `insert into approval_effects(request_id,version,effect_kind,execution_mode,status,attempt_count,updated_at)
         values(?,?,?,?,?,?,?)`,
      )
      .bind(id, 1, input.effect.kind, input.effect.executionMode, "pending", 0, now),
    binding
      .prepare(
        "insert into approval_events(id,request_id,kind,actor_type,actor_id,payload_json,created_at) values(?,?,?,?,?,?,?)",
      )
      .bind(
        uuid(),
        id,
        "created",
        "api_token",
        actor.token.id,
        JSON.stringify({ state: source.state }),
        now,
      ),
  ]);
  return getApproval(binding, id, actor, false);
}

export async function createUserApproval(
  binding: D1Database,
  userId: string,
  input: ApprovalCreateInput,
) {
  const existing = await binding
    .prepare("select id from approval_requests where idempotency_key=?")
    .bind(input.idempotencyKey)
    .first<{ id: string }>();
  if (existing) return { id: existing.id, duplicate: true };

  validateEffectSubject(input.effect.kind, input.effect.input, input.subjectType, input.subjectId);
  const validated = validateRegisteredEffect(
    input.effect.kind,
    input.effect.executionMode,
    input.effect.input,
  );
  const source = await currentSourceHash(binding, input.subjectType, input.subjectId);
  const preconditions = validateRegisteredPreconditions(
    input.effect.kind,
    source.state,
    input.preconditions,
    validated.input,
  );
  if (input.sourceHash && input.sourceHash !== source.hash) {
    throw new HttpError(409, "Approval subject changed before creation", "approval_source_changed");
  }
  const id = uuid();
  const now = Date.now();
  await binding.batch([
    binding
      .prepare(
        `insert into approval_requests(
          id,kind,risk,status,requester_type,requester_id,requester_token_id,run_id,
          subject_type,subject_id,current_version,execution_mode,effect_kind,effect_status,
          idempotency_key,expires_at,created_at,updated_at
        ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        input.kind,
        input.risk,
        "pending",
        "user",
        userId,
        null,
        input.runId ?? null,
        input.subjectType,
        input.subjectId,
        1,
        input.effect.executionMode,
        input.effect.kind,
        "pending",
        input.idempotencyKey,
        now + 7 * 86_400_000,
        now,
        now,
      ),
    binding
      .prepare(
        `insert into approval_request_versions(
          request_id,version,title,summary,evidence_json,effect_input_json,preconditions_json,
          source_hash,policy_version,created_by_type,created_by_id,created_at
        ) values(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        1,
        input.title,
        input.summary,
        JSON.stringify(input.evidence),
        JSON.stringify(validated.input),
        JSON.stringify(preconditions),
        source.hash,
        input.policyVersion,
        "user",
        userId,
        now,
      ),
    binding
      .prepare(
        `insert into approval_effects(request_id,version,effect_kind,execution_mode,status,attempt_count,updated_at)
         values(?,?,?,?,?,?,?)`,
      )
      .bind(id, 1, input.effect.kind, input.effect.executionMode, "pending", 0, now),
    binding
      .prepare(
        "insert into approval_events(id,request_id,kind,actor_type,actor_id,payload_json,created_at) values(?,?,?,?,?,?,?)",
      )
      .bind(uuid(), id, "created", "user", userId, JSON.stringify({ state: source.state }), now),
  ]);
  return { id, duplicate: false };
}

export async function listApprovals(
  binding: D1Database,
  options: { status?: string | null; kind?: string | null; risk?: string | null; limit?: number },
) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  for (const [column, value] of [
    ["r.status", options.status],
    ["r.kind", options.kind],
    ["r.risk", options.risk],
  ] as const) {
    if (value) {
      clauses.push(`${column}=?`);
      values.push(value);
    }
  }
  const result = await binding
    .prepare(
      `select r.*,v.title,v.summary,v.policy_version
       from approval_requests r
       join approval_request_versions v on v.request_id=r.id and v.version=r.current_version
       ${clauses.length ? `where ${clauses.join(" and ")}` : ""}
       order by case r.status when 'pending' then 0 when 'changes_requested' then 1 else 2 end,
                case r.risk when 'critical' then 0 else 1 end,r.created_at asc
       limit ?`,
    )
    .bind(...values, Math.min(options.limit ?? 100, 100))
    .all<Record<string, unknown>>();
  const counts = await binding
    .prepare("select status,count(*) count from approval_requests group by status")
    .all<{ status: string; count: number }>();
  return { items: result.results ?? [], counts: counts.results ?? [] };
}

export async function listActorApprovals(binding: D1Database, actor: TokenActor) {
  const result = await binding
    .prepare(
      `select r.id,r.kind,r.risk,r.status,r.effect_status effectStatus,r.current_version currentVersion,
              r.execution_mode executionMode,r.effect_kind effectKind,r.expires_at expiresAt,
              r.updated_at version,v.title,v.summary
       from approval_requests r
       join approval_request_versions v on v.request_id=r.id and v.version=r.current_version
       where r.requester_token_id=?
       order by r.created_at desc limit 100`,
    )
    .bind(actor.token.id)
    .all<Record<string, unknown>>();
  return { items: result.results ?? [] };
}

export async function getApproval(
  binding: D1Database,
  id: string,
  actor?: TokenActor,
  admin = false,
) {
  const request = await requestRow(binding, id);
  if (!admin && actor) {
    const owns = request.requester_token_id === actor.token.id;
    if (!owns && actor.profile.role !== "admin")
      throw new HttpError(403, "Approval is not visible to this token", "approval_forbidden");
  }
  const current = await versionRow(binding, request);
  const effect = await effectRow(binding, request.id);
  if (!admin && actor?.profile.role !== "admin") {
    return {
      id: request.id,
      kind: request.kind,
      risk: request.risk,
      status: request.status,
      effectStatus: request.effect_status,
      currentVersion: request.current_version,
      title: current.title,
      summary: current.summary,
      expiresAt: new Date(request.expires_at).toISOString(),
      executionMode: request.execution_mode,
      effectKind: request.effect_kind,
      leaseExpiresAt: effect.lease_expires_at
        ? new Date(effect.lease_expires_at).toISOString()
        : null,
      version: request.updated_at,
    };
  }

  const [versions, decisions, events, attempts] = await Promise.all([
    binding
      .prepare("select * from approval_request_versions where request_id=? order by version desc")
      .bind(id)
      .all<VersionRow>(),
    binding
      .prepare("select * from approval_decisions where request_id=? order by created_at desc")
      .bind(id)
      .all<Record<string, unknown>>(),
    binding
      .prepare("select * from approval_events where request_id=? order by created_at desc")
      .bind(id)
      .all<Record<string, unknown>>(),
    binding
      .prepare("select * from approval_effect_attempts where request_id=? order by attempt desc")
      .bind(id)
      .all<Record<string, unknown>>(),
  ]);
  const definition = registeredEffect(effect.effect_kind);
  return {
    request,
    current: {
      ...current,
      evidence: parseJson(current.evidence_json, {}),
      effectInput: parseJson(current.effect_input_json, {}),
      preconditions: parseJson(current.preconditions_json, {}),
      preview: definition.preview(parseJson(current.effect_input_json, {})),
    },
    effect,
    versions: versions.results ?? [],
    decisions: decisions.results ?? [],
    events: events.results ?? [],
    attempts: attempts.results ?? [],
  };
}

export async function reviseApproval(
  binding: D1Database,
  id: string,
  actor: TokenActor,
  input: ApprovalRevisionInput,
) {
  const request = await requestRow(binding, id);
  if (request.requester_token_id !== actor.token.id)
    throw new HttpError(
      403,
      "Only the requesting token may revise this approval",
      "approval_forbidden",
    );
  if (request.status !== "changes_requested")
    throw new HttpError(409, "Approval is not awaiting changes", "approval_not_revisable");
  const validated = validateRegisteredEffect(
    request.effect_kind as Parameters<typeof registeredEffect>[0],
    request.execution_mode,
    input.effectInput,
  );
  validateEffectSubject(
    request.effect_kind,
    validated.input,
    request.subject_type,
    request.subject_id,
  );
  const source = await currentSourceHash(binding, request.subject_type, request.subject_id);
  if (input.sourceHash && input.sourceHash !== source.hash)
    throw new HttpError(409, "Approval subject changed", "approval_source_changed");
  const preconditions = validateRegisteredPreconditions(
    request.effect_kind,
    source.state,
    input.preconditions,
    validated.input,
  );
  const version = request.current_version + 1;
  const now = Date.now();
  await binding.batch([
    binding
      .prepare(
        `insert into approval_request_versions(
          request_id,version,title,summary,evidence_json,effect_input_json,preconditions_json,
          source_hash,policy_version,created_by_type,created_by_id,created_at
        ) values(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        version,
        input.title,
        input.summary,
        JSON.stringify(input.evidence),
        JSON.stringify(validated.input),
        JSON.stringify(preconditions),
        source.hash,
        input.policyVersion,
        "api_token",
        actor.token.id,
        now,
      ),
    binding
      .prepare(
        "update approval_requests set status='pending',current_version=?,effect_status='pending',expires_at=?,decided_by_user_id=null,decided_at=null,updated_at=? where id=?",
      )
      .bind(version, now + 7 * 86_400_000, now, id),
    binding
      .prepare(
        "update approval_effects set version=?,status='pending',lease_token_hash=null,leased_to_token_id=null,lease_expires_at=null,last_error=null,updated_at=? where request_id=?",
      )
      .bind(version, now, id),
    binding
      .prepare(
        "insert into approval_events(id,request_id,kind,actor_type,actor_id,payload_json,created_at) values(?,?,?,?,?,?,?)",
      )
      .bind(uuid(), id, "revised", "api_token", actor.token.id, JSON.stringify({ version }), now),
  ]);
  return getApproval(binding, id, actor, false);
}

async function markSuperseded(binding: D1Database, request: RequestRow, currentHash: string) {
  const now = Date.now();
  await binding.batch([
    binding
      .prepare(
        "update approval_requests set status='superseded',effect_status='superseded',updated_at=? where id=?",
      )
      .bind(now, request.id),
    binding
      .prepare("update approval_effects set status='superseded',updated_at=? where request_id=?")
      .bind(now, request.id),
    binding
      .prepare(
        "insert into approval_events(id,request_id,kind,actor_type,actor_id,payload_json,created_at) values(?,?,?,?,?,?,?)",
      )
      .bind(uuid(), request.id, "superseded", "system", null, JSON.stringify({ currentHash }), now),
  ]);
}

export async function decideApproval(
  binding: D1Database,
  id: string,
  adminUserId: string,
  input: ApprovalDecisionInput,
) {
  const request = await requestRow(binding, id);
  if (request.status !== "pending")
    throw new HttpError(409, `Approval is ${request.status}`, "approval_not_pending");
  const version = await versionRow(binding, request);
  const source = await currentSourceHash(binding, request.subject_type, request.subject_id);
  if (source.hash !== version.source_hash) {
    await markSuperseded(binding, request, source.hash);
    throw new HttpError(409, "Approval evidence is stale", "approval_superseded");
  }
  const effectInput = validateRegisteredEffect(
    request.effect_kind,
    request.execution_mode,
    parseJson<Record<string, unknown>>(version.effect_input_json, {}),
  ).input;
  validateRegisteredPreconditions(
    request.effect_kind,
    source.state,
    parseJson<Record<string, unknown>>(version.preconditions_json, {}),
    effectInput,
  );

  const now = Date.now();
  const nextStatus =
    input.action === "approve"
      ? "approved"
      : input.action === "reject"
        ? "rejected"
        : "changes_requested";
  const effectStatus =
    input.action === "approve"
      ? request.execution_mode === "agent"
        ? "awaiting_agent"
        : "pending"
      : "superseded";
  const decisionId = uuid();
  const evidence = parseJson<Record<string, unknown>>(version.evidence_json, {});
  const appealId = typeof evidence["appealId"] === "string" ? evidence["appealId"] : null;
  const decisionStatements: D1PreparedStatement[] = [
    binding
      .prepare(
        "insert into approval_decisions(id,request_id,version,action,admin_user_id,reason,created_at) values(?,?,?,?,?,?,?)",
      )
      .bind(
        decisionId,
        id,
        request.current_version,
        input.action,
        adminUserId,
        input.reason ?? null,
        now,
      ),
    binding
      .prepare(
        "update approval_requests set status=?,effect_status=?,decided_by_user_id=?,decided_at=?,updated_at=? where id=? and status='pending'",
      )
      .bind(nextStatus, effectStatus, adminUserId, now, now, id),
    binding
      .prepare(
        "update approval_effects set status=?,last_error=null,updated_at=? where request_id=?",
      )
      .bind(effectStatus, now, id),
    binding
      .prepare(
        "insert into approval_events(id,request_id,kind,actor_type,actor_id,payload_json,created_at) values(?,?,?,?,?,?,?)",
      )
      .bind(
        uuid(),
        id,
        `decision.${input.action}`,
        "user",
        adminUserId,
        JSON.stringify({ decisionId, reason: input.reason ?? null }),
        now,
      ),
    requesterNotification(binding, request, `approval.${nextStatus}`, { id, reason: input.reason }),
  ];
  if (appealId && input.action === "reject") {
    decisionStatements.push(
      binding
        .prepare("update moderation_appeals set status='rejected',resolved_at=? where id=?")
        .bind(now, appealId),
    );
  }
  await binding.batch(decisionStatements);
  if (input.action === "approve" && request.execution_mode === "server") {
    await executeServerEffect(
      binding,
      id,
      adminUserId,
      input.reason ?? "Approved by administrator",
    );
  }
  return getApproval(binding, id, undefined, true);
}

export async function executeServerEffect(
  binding: D1Database,
  id: string,
  adminUserId: string,
  reason = "Approved effect retry",
) {
  const request = await requestRow(binding, id);
  if (request.status !== "approved" || request.execution_mode !== "server")
    throw new HttpError(409, "Approval has no runnable server effect", "effect_not_runnable");
  const version = await versionRow(binding, request);
  const effect = await effectRow(binding, id);
  if (!["pending", "failed"].includes(effect.status))
    throw new HttpError(409, `Effect is ${effect.status}`, "effect_not_runnable");
  const source = await currentSourceHash(binding, request.subject_type, request.subject_id);
  if (source.hash !== version.source_hash) {
    await markSuperseded(binding, request, source.hash);
    throw new HttpError(409, "Approval evidence is stale", "approval_superseded");
  }
  const input = parseJson<Record<string, unknown>>(version.effect_input_json, {});
  const { definition, input: parsed } = validateRegisteredEffect(
    effect.effect_kind,
    "server",
    input,
  );
  validateRegisteredPreconditions(
    effect.effect_kind,
    source.state,
    parseJson<Record<string, unknown>>(version.preconditions_json, {}),
    parsed,
  );
  const attempt = effect.attempt_count + 1;
  const startedAt = Date.now();
  const inputHash = await sha256(stableJson(parsed));
  try {
    const domain = definition.prepare?.(binding, parsed, adminUserId, reason) ?? [];
    const finishedAt = Date.now();
    const output = { effectKind: effect.effect_kind, applied: domain.length };
    const successStatements: D1PreparedStatement[] = [
      ...domain,
      binding
        .prepare(
          "update approval_effects set status='succeeded',attempt_count=?,lease_token_hash=null,leased_to_token_id=null,lease_expires_at=null,last_error=null,updated_at=? where request_id=?",
        )
        .bind(attempt, finishedAt, id),
      binding
        .prepare("update approval_requests set effect_status='succeeded',updated_at=? where id=?")
        .bind(finishedAt, id),
      binding
        .prepare(
          `insert into approval_effect_attempts(
            id,request_id,version,attempt,executor_type,executor_id,status,input_hash,output_json,error,started_at,finished_at
          ) values(?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          uuid(),
          id,
          request.current_version,
          attempt,
          "server",
          adminUserId,
          "succeeded",
          inputHash,
          JSON.stringify(output),
          null,
          startedAt,
          finishedAt,
        ),
      binding
        .prepare(
          "insert into approval_events(id,request_id,kind,actor_type,actor_id,payload_json,created_at) values(?,?,?,?,?,?,?)",
        )
        .bind(
          uuid(),
          id,
          "effect.succeeded",
          "user",
          adminUserId,
          JSON.stringify(output),
          finishedAt,
        ),
      requesterNotification(binding, request, "approval.effect_succeeded", output),
    ];
    const evidence = parseJson<Record<string, unknown>>(version.evidence_json, {});
    if (typeof evidence["appealId"] === "string") {
      successStatements.push(
        binding
          .prepare("update moderation_appeals set status='approved',resolved_at=? where id=?")
          .bind(finishedAt, evidence["appealId"]),
      );
    }
    await binding.batch(successStatements);
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = Date.now();
    await binding.batch([
      binding
        .prepare(
          "update approval_effects set status='failed',attempt_count=?,last_error=?,updated_at=? where request_id=?",
        )
        .bind(attempt, message, finishedAt, id),
      binding
        .prepare("update approval_requests set effect_status='failed',updated_at=? where id=?")
        .bind(finishedAt, id),
      binding
        .prepare(
          `insert into approval_effect_attempts(
            id,request_id,version,attempt,executor_type,executor_id,status,input_hash,output_json,error,started_at,finished_at
          ) values(?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          uuid(),
          id,
          request.current_version,
          attempt,
          "server",
          adminUserId,
          "failed",
          inputHash,
          null,
          message,
          startedAt,
          finishedAt,
        ),
      binding
        .prepare(
          "insert into approval_events(id,request_id,kind,actor_type,actor_id,payload_json,created_at) values(?,?,?,?,?,?,?)",
        )
        .bind(
          uuid(),
          id,
          "effect.failed",
          "user",
          adminUserId,
          JSON.stringify({ error: message }),
          finishedAt,
        ),
      requesterNotification(binding, request, "approval.effect_failed", {
        id,
        error: message,
      }),
    ]);
    throw new HttpError(
      500,
      "Approved effect failed; use explicit retry",
      "approval_effect_failed",
    );
  }
}

export async function retryApprovedEffect(
  binding: D1Database,
  id: string,
  adminUserId: string,
  reason = "Administrator authorized an explicit effect retry",
) {
  const request = await requestRow(binding, id);
  if (request.status !== "approved")
    throw new HttpError(409, "Approval is not approved", "effect_not_runnable");
  const effect = await effectRow(binding, id);
  if (effect.status !== "failed")
    throw new HttpError(409, `Effect is ${effect.status}`, "effect_not_retryable");
  if (request.execution_mode === "server") {
    await executeServerEffect(binding, id, adminUserId, reason);
    return getApproval(binding, id, undefined, true);
  }

  const version = await versionRow(binding, request);
  const source = await currentSourceHash(binding, request.subject_type, request.subject_id);
  if (source.hash !== version.source_hash) {
    await markSuperseded(binding, request, source.hash);
    throw new HttpError(409, "Approval evidence is stale", "approval_superseded");
  }
  const parsedInput = validateRegisteredEffect(
    request.effect_kind,
    "agent",
    parseJson<Record<string, unknown>>(version.effect_input_json, {}),
  ).input;
  validateRegisteredPreconditions(
    request.effect_kind,
    source.state,
    parseJson<Record<string, unknown>>(version.preconditions_json, {}),
    parsedInput,
  );
  const now = Date.now();
  await binding.batch([
    binding
      .prepare(
        "update approval_effects set status='awaiting_agent',lease_token_hash=null,leased_to_token_id=null,lease_expires_at=null,last_error=null,updated_at=? where request_id=? and status='failed'",
      )
      .bind(now, id),
    binding
      .prepare(
        "update approval_requests set effect_status='awaiting_agent',updated_at=? where id=? and effect_status='failed'",
      )
      .bind(now, id),
    binding
      .prepare(
        "insert into approval_events(id,request_id,kind,actor_type,actor_id,payload_json,created_at) values(?,?,?,?,?,?,?)",
      )
      .bind(
        uuid(),
        id,
        "effect.retry_authorized",
        "user",
        adminUserId,
        JSON.stringify({ reason }),
        now,
      ),
  ]);
  return getApproval(binding, id, undefined, true);
}

export async function claimAgentEffect(
  binding: D1Database,
  id: string,
  actor: TokenActor,
  claimedRunId?: string | null,
) {
  const request = await requestRow(binding, id);
  if (request.status !== "approved" || request.execution_mode !== "agent")
    throw new HttpError(409, "Approval has no claimable Agent effect", "effect_not_claimable");
  if (request.requester_token_id !== actor.token.id)
    throw new HttpError(403, "Only the requesting run may claim this effect", "approval_forbidden");
  if (request.run_id && request.run_id !== claimedRunId)
    throw new HttpError(403, "Effect lease belongs to another catalog run", "approval_forbidden");
  const version = await versionRow(binding, request);
  const source = await currentSourceHash(binding, request.subject_type, request.subject_id);
  if (source.hash !== version.source_hash) {
    await markSuperseded(binding, request, source.hash);
    throw new HttpError(409, "Approval evidence is stale", "approval_superseded");
  }
  const parsedInput = validateRegisteredEffect(
    request.effect_kind,
    "agent",
    parseJson<Record<string, unknown>>(version.effect_input_json, {}),
  ).input;
  validateRegisteredPreconditions(
    request.effect_kind,
    source.state,
    parseJson<Record<string, unknown>>(version.preconditions_json, {}),
    parsedInput,
  );
  const effect = await effectRow(binding, id);
  if (effect.status === "succeeded")
    throw new HttpError(409, "Effect already succeeded", "effect_complete");
  if (effect.status === "failed")
    throw new HttpError(
      409,
      "Failed effects require an explicit administrator retry",
      "effect_retry_required",
    );
  if (effect.status === "running" && (effect.lease_expires_at ?? 0) > Date.now())
    throw new HttpError(409, "Effect lease is already active", "effect_lease_active");
  if (!["awaiting_agent", "running"].includes(effect.status))
    throw new HttpError(409, `Effect is ${effect.status}`, "effect_not_claimable");
  const leaseToken = randomToken("dshx_approval");
  const leaseExpiresAt = Date.now() + 15 * 60_000;
  await binding.batch([
    binding
      .prepare(
        "update approval_effects set status='running',lease_token_hash=?,leased_to_token_id=?,lease_expires_at=?,last_error=null,updated_at=? where request_id=?",
      )
      .bind(await sha256(leaseToken), actor.token.id, leaseExpiresAt, Date.now(), id),
    binding
      .prepare("update approval_requests set effect_status='running',updated_at=? where id=?")
      .bind(Date.now(), id),
    binding
      .prepare(
        "insert into approval_events(id,request_id,kind,actor_type,actor_id,payload_json,created_at) values(?,?,?,?,?,?,?)",
      )
      .bind(
        uuid(),
        id,
        "effect.claimed",
        "api_token",
        actor.token.id,
        JSON.stringify({ leaseExpiresAt }),
        Date.now(),
      ),
  ]);
  return {
    approvalId: id,
    leaseToken,
    leaseExpiresAt: new Date(leaseExpiresAt).toISOString(),
    attempt: effect.attempt_count + 1,
    effectKind: request.effect_kind,
    runId: request.run_id,
    input: parsedInput,
  };
}

export async function completeAgentEffect(
  binding: D1Database,
  id: string,
  actor: TokenActor,
  input: {
    leaseToken: string;
    status: "succeeded" | "failed";
    output?: unknown;
    error?: string | null | undefined;
  },
) {
  const request = await requestRow(binding, id);
  const effect = await effectRow(binding, id);
  if (request.requester_token_id !== actor.token.id)
    throw new HttpError(403, "Effect lease belongs to another run", "approval_forbidden");
  if (effect.status === "succeeded" && input.status === "succeeded")
    return { approvalId: id, status: "succeeded", duplicate: true };
  if (effect.leased_to_token_id !== actor.token.id)
    throw new HttpError(403, "Effect lease belongs to another run", "approval_forbidden");
  if (
    effect.status !== "running" ||
    !effect.lease_token_hash ||
    (await sha256(input.leaseToken)) !== effect.lease_token_hash
  ) {
    throw new HttpError(409, "Effect lease is invalid", "effect_lease_invalid");
  }
  if ((effect.lease_expires_at ?? 0) <= Date.now())
    throw new HttpError(409, "Effect lease expired", "effect_lease_expired");
  const version = await versionRow(binding, request);
  const attempt = effect.attempt_count + 1;
  const finishedAt = Date.now();
  const inputHash = await sha256(version.effect_input_json);
  await binding.batch([
    binding
      .prepare(
        "update approval_effects set status=?,attempt_count=?,lease_token_hash=null,leased_to_token_id=null,lease_expires_at=null,last_error=?,updated_at=? where request_id=?",
      )
      .bind(input.status, attempt, input.error ?? null, finishedAt, id),
    binding
      .prepare("update approval_requests set effect_status=?,updated_at=? where id=?")
      .bind(input.status, finishedAt, id),
    binding
      .prepare(
        `insert into approval_effect_attempts(
          id,request_id,version,attempt,executor_type,executor_id,status,input_hash,output_json,error,started_at,finished_at
        ) values(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        uuid(),
        id,
        request.current_version,
        attempt,
        "api_token",
        actor.token.id,
        input.status,
        inputHash,
        input.output ? JSON.stringify(input.output) : null,
        input.error ?? null,
        effect.updated_at,
        finishedAt,
      ),
    binding
      .prepare(
        "insert into approval_events(id,request_id,kind,actor_type,actor_id,payload_json,created_at) values(?,?,?,?,?,?,?)",
      )
      .bind(
        uuid(),
        id,
        `effect.${input.status}`,
        "api_token",
        actor.token.id,
        JSON.stringify({ output: input.output ?? null, error: input.error ?? null }),
        finishedAt,
      ),
    requesterNotification(binding, request, `approval.effect_${input.status}`, { id }),
  ]);
  return { approvalId: id, status: input.status, duplicate: false };
}
