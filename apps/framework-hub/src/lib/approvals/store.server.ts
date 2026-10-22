/**
 * How an approval is persisted.
 *
 * The rows, the subject each request is about, the two status rewrites that
 * happen without an administrator (expiry on read, supersession when the
 * subject moved), and the event and notification rows every operation writes.
 * Nothing here decides anything — `transitions.ts` does that — and nothing
 * outside here reads an `approval_*` table.
 */

import type { BatchItem } from "drizzle-orm/batch";

import { sha256 } from "@/lib/auth/tokens.server";
import { runDrizzleBatch } from "@/lib/db/batch";
import type { Database } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";
import { HttpError, uuid } from "@/lib/http";

import type { ApprovalEffectKind } from "./contracts";
import { subjectStateJson } from "./subject";
import {
  isExpired,
  type ApprovalEffect,
  type ApprovalRequest,
  type ApprovalStatus,
  type EffectStatus,
  type ExecutionMode,
} from "./transitions";

export type RequestRow = {
  id: string;
  kind: string;
  risk: "high" | "critical";
  status: ApprovalStatus;
  requester_type: "user" | "api_token" | "system";
  requester_id: string | null;
  requester_token_id: string | null;
  run_id: string | null;
  subject_type: string;
  subject_id: string;
  current_version: number;
  execution_mode: ExecutionMode;
  effect_kind: ApprovalEffectKind;
  effect_status: EffectStatus;
  idempotency_key: string;
  expires_at: number;
  decided_by_user_id: string | null;
  decided_at: number | null;
  created_at: number;
  updated_at: number;
};

export type VersionRow = {
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

export type EffectRow = {
  request_id: string;
  version: number;
  effect_kind: ApprovalEffectKind;
  execution_mode: ExecutionMode;
  status: EffectStatus;
  attempt_count: number;
  lease_token_hash: string | null;
  leased_to_token_id: string | null;
  lease_expires_at: number | null;
  last_error: string | null;
  updated_at: number;
};

export function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** The request as the state machine sees it. */
export function toRequest(row: RequestRow): ApprovalRequest {
  return {
    status: row.status,
    executionMode: row.execution_mode,
    requesterTokenId: row.requester_token_id,
    runId: row.run_id,
    currentVersion: row.current_version,
    expiresAt: row.expires_at,
  };
}

/** The effect as the state machine sees it. */
export function toEffect(row: EffectRow): ApprovalEffect {
  return {
    status: row.status,
    attemptCount: row.attempt_count,
    leaseTokenHash: row.lease_token_hash,
    leasedToTokenId: row.leased_to_token_id,
    leaseExpiresAt: row.lease_expires_at,
  };
}

/**
 * The request, expiring it first if its window has closed.
 *
 * Expiry is recorded on read rather than by a scheduled job because nothing
 * else can observe a request before someone asks about it, and a pending row
 * that outlived its window must never become decidable again.
 */
export async function requestRow(binding: Database, id: string): Promise<RequestRow> {
  const row = await binding.get<RequestRow>(
    parameterizedSql("select * from approval_requests where id=?", [id]),
  );
  if (!row) throw new HttpError(404, "Approval request not found", "approval_not_found");
  const now = Date.now();
  if (!isExpired(toRequest(row), now)) return row;
  await runDrizzleBatch(binding, [
    ...closedRequestStatements(binding, id, {
      status: "expired",
      effectStatus: "superseded",
      now,
    }),
    eventStatement(binding, id, {
      kind: "expired",
      actorType: "system",
      actorId: null,
      payload: {},
      now,
    }),
  ]);
  return { ...row, status: "expired", effect_status: "superseded" };
}

/** The version an approval currently rests on. */
export async function versionRow(binding: Database, request: RequestRow): Promise<VersionRow> {
  const row = await binding.get<VersionRow>(
    parameterizedSql("select * from approval_request_versions where request_id=? and version=?", [
      request.id,
      request.current_version,
    ]),
  );
  if (!row) throw new HttpError(500, "Approval version is missing", "approval_version_missing");
  return row;
}

/** The single effect row an approval owns. */
export async function effectRow(binding: Database, requestId: string): Promise<EffectRow> {
  const row = await binding.get<EffectRow>(
    parameterizedSql("select * from approval_effects where request_id=?", [requestId]),
  );
  if (!row) throw new HttpError(500, "Approval effect is missing", "approval_effect_missing");
  return row;
}

/**
 * The subject's current state, and the fingerprint an approval is compared
 * against. A subject that cannot be read is a 404: an approval about nothing
 * is not one an administrator can decide.
 */
export async function approvalSubject(
  binding: Database,
  type: string,
  id: string,
): Promise<{ state: Record<string, unknown>; fingerprint: string }> {
  const state = await readSubject(binding, type, id);
  if (!state) throw new HttpError(404, "Approval subject not found", "approval_subject_not_found");
  return { state, fingerprint: await sha256(subjectStateJson(state)) };
}

function readSubject(binding: Database, type: string, id: string) {
  if (type === "user")
    return binding.get<Record<string, unknown>>(
      parameterizedSql(
        "select user_id id,role,status,github_login,updated_at from user_profiles where user_id=?",
        [id],
      ),
    );
  if (type === "review")
    return binding.get<Record<string, unknown>>(
      parameterizedSql(
        "select id,plugin_id,user_id,status,rating,updated_at from plugin_reviews where id=?",
        [id],
      ),
    );
  if (type === "reply")
    return binding.get<Record<string, unknown>>(
      parameterizedSql(
        "select id,review_id,user_id,status,updated_at from review_replies where id=?",
        [id],
      ),
    );
  if (type === "plugin")
    return binding.get<Record<string, unknown>>(
      parameterizedSql(
        "select id,identity_key,slug,status,lifecycle_status,verification_status,updated_at from plugins where id=?",
        [id],
      ),
    );
  if (type === "maintainer") {
    const [pluginId, userId] = id.split(":", 2);
    if (!pluginId || !userId) return Promise.resolve(null);
    // An absent maintainer is a state too: granting names a pair that does not
    // exist yet, so its "current state" is the absence itself.
    return binding
      .get<Record<string, unknown>>(
        parameterizedSql(
          "select plugin_id,user_id,role,source,added_at,revoked_at from plugin_maintainers where plugin_id=? and user_id=?",
          [pluginId, userId],
        ),
      )
      .then((row) => row ?? { plugin_id: pluginId, user_id: userId, missing: true });
  }
  if (type === "catalog_run")
    return binding.get<Record<string, unknown>>(
      parameterizedSql(
        "select id,status,mode,expected_items,received_items,accepted_items,rejected_items,payload_hash from catalog_sync_runs where id=?",
        [id],
      ),
    );
  return Promise.resolve(null);
}

/**
 * The two writes every closed request makes: its own status and its effect's.
 * Shared by expiry and supersession, which differ only in the status they
 * record and the event that explains it.
 */
export function closedRequestStatements(
  binding: Database,
  id: string,
  options: { status: "expired" | "superseded"; effectStatus: "superseded"; now: number },
): BatchItem<"sqlite">[] {
  return [
    binding.run(
      parameterizedSql(
        "update approval_requests set status=?,effect_status=?,updated_at=? where id=?",
        [options.status, options.effectStatus, options.now, id],
      ),
    ),
    binding.run(
      parameterizedSql("update approval_effects set status=?,updated_at=? where request_id=?", [
        options.effectStatus,
        options.now,
        id,
      ]),
    ),
  ];
}

/**
 * The subject moved past what the administrator reviewed: the request can no
 * longer be decided, and saying so must outlive the 409 that reports it.
 */
export async function markSuperseded(
  binding: Database,
  id: string,
  currentFingerprint: string,
): Promise<void> {
  const now = Date.now();
  await runDrizzleBatch(binding, [
    ...closedRequestStatements(binding, id, {
      status: "superseded",
      effectStatus: "superseded",
      now,
    }),
    eventStatement(binding, id, {
      kind: "superseded",
      actorType: "system",
      actorId: null,
      payload: { currentHash: currentFingerprint },
      now,
    }),
  ]);
}

export function eventStatement(
  binding: Database,
  id: string,
  event: {
    kind: string;
    actorType: "user" | "api_token" | "system";
    actorId: string | null;
    payload: Record<string, unknown>;
    now: number;
  },
): BatchItem<"sqlite"> {
  return binding.run(
    parameterizedSql(
      "insert into approval_events(id,request_id,kind,actor_type,actor_id,payload_json,created_at) values(?,?,?,?,?,?,?)",
      [
        uuid(),
        id,
        event.kind,
        event.actorType,
        event.actorId,
        JSON.stringify(event.payload),
        event.now,
      ],
    ),
  );
}

/**
 * Tell whoever asked. An API-token request has no user to notify directly, so
 * the notification goes to the token's owner instead.
 */
export function requesterNotification(
  binding: Database,
  request: RequestRow,
  kind: string,
  payload: Record<string, unknown>,
): BatchItem<"sqlite"> {
  if (request.requester_type === "user" && request.requester_id)
    return binding.run(
      parameterizedSql(
        "insert into notification_events(id,user_id,kind,actor_user_id,subject_type,subject_id,payload_json,created_at) values(?,?,?,?,?,?,?,?)",
        [
          uuid(),
          request.requester_id,
          kind,
          null,
          "approval",
          request.id,
          JSON.stringify(payload),
          Date.now(),
        ],
      ),
    );
  return binding.run(
    parameterizedSql(
      `insert into notification_events(id,user_id,kind,actor_user_id,subject_type,subject_id,payload_json,created_at)
       select ?,user_id,?,null,'approval',?,?,? from api_tokens where id=?`,
      [uuid(), kind, request.id, JSON.stringify(payload), Date.now(), request.requester_token_id],
    ),
  );
}

/** The administration queue: open work first, critical before high, oldest first. */
export async function approvalList(
  binding: Database,
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
  const items = await binding.all<Record<string, unknown>>(
    parameterizedSql(
      `select r.*,v.title,v.summary,v.policy_version
       from approval_requests r
       join approval_request_versions v on v.request_id=r.id and v.version=r.current_version
       ${clauses.length ? `where ${clauses.join(" and ")}` : ""}
       order by case r.status when 'pending' then 0 when 'changes_requested' then 1 else 2 end,
                case r.risk when 'critical' then 0 else 1 end,r.created_at asc
       limit ?`,
      [...values, Math.min(options.limit ?? 100, 100)],
    ),
  );
  const counts = await binding.all<{ status: string; count: number }>(
    parameterizedSql("select status,count(*) count from approval_requests group by status", []),
  );
  return { items, counts };
}

/** What one token has asked for, newest first. */
export async function requesterApprovalList(binding: Database, tokenId: string) {
  return binding.all<Record<string, unknown>>(
    parameterizedSql(
      `select r.id,r.kind,r.risk,r.status,r.effect_status effectStatus,r.current_version currentVersion,
              r.execution_mode executionMode,r.effect_kind effectKind,r.expires_at expiresAt,
              r.updated_at version,v.title,v.summary
       from approval_requests r
       join approval_request_versions v on v.request_id=r.id and v.version=r.current_version
       where r.requester_token_id=?
       order by r.created_at desc limit 100`,
      [tokenId],
    ),
  );
}

/** Everything an administrator's detail view shows about one request. */
export async function approvalTrail(binding: Database, id: string) {
  const [versions, decisions, events, attempts] = await Promise.all([
    binding.all<VersionRow>(
      parameterizedSql(
        "select * from approval_request_versions where request_id=? order by version desc",
        [id],
      ),
    ),
    binding.all<Record<string, unknown>>(
      parameterizedSql(
        "select * from approval_decisions where request_id=? order by created_at desc",
        [id],
      ),
    ),
    binding.all<Record<string, unknown>>(
      parameterizedSql(
        "select * from approval_events where request_id=? order by created_at desc",
        [id],
      ),
    ),
    binding.all<Record<string, unknown>>(
      parameterizedSql(
        "select * from approval_effect_attempts where request_id=? order by attempt desc",
        [id],
      ),
    ),
  ]);
  return { versions, decisions, events, attempts };
}

/**
 * What recording an attempt writes, in both directions.
 *
 * Success and failure differ only in the status, the output and the error, so
 * the call log, the event and the notification the requester sees cannot fall
 * out of step with each other.
 */
export function effectOutcomeStatements(
  binding: Database,
  request: RequestRow,
  id: string,
  attempt: {
    status: "succeeded" | "failed";
    attempt: number;
    inputHash: string;
    output: Record<string, unknown> | null;
    error: string | null;
    startedAt: number;
    finishedAt: number;
    executor: string;
  },
): BatchItem<"sqlite">[] {
  const { status, finishedAt } = attempt;
  return [
    binding.run(
      parameterizedSql(
        "update approval_effects set status=?,attempt_count=?,lease_token_hash=null,leased_to_token_id=null,lease_expires_at=null,last_error=?,updated_at=? where request_id=?",
        [status, attempt.attempt, attempt.error, finishedAt, id],
      ),
    ),
    binding.run(
      parameterizedSql("update approval_requests set effect_status=?,updated_at=? where id=?", [
        status,
        finishedAt,
        id,
      ]),
    ),
    binding.run(
      parameterizedSql(
        `insert into approval_effect_attempts(
          id,request_id,version,attempt,executor_type,executor_id,status,input_hash,output_json,error,started_at,finished_at
        ) values(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          uuid(),
          id,
          request.current_version,
          attempt.attempt,
          "server",
          attempt.executor,
          status,
          attempt.inputHash,
          attempt.output ? JSON.stringify(attempt.output) : null,
          attempt.error,
          attempt.startedAt,
          finishedAt,
        ],
      ),
    ),
    eventStatement(binding, id, {
      kind: `effect.${status}`,
      actorType: "user",
      actorId: attempt.executor,
      payload: status === "succeeded" ? (attempt.output ?? {}) : { error: attempt.error },
      now: finishedAt,
    }),
    requesterNotification(
      binding,
      request,
      `approval.effect_${status}`,
      status === "succeeded" ? (attempt.output ?? {}) : { id, error: attempt.error },
    ),
  ];
}
