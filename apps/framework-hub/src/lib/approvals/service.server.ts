/**
 * Approval operations.
 *
 * Every function here does the same three things in the same order: read what
 * the request rests on, ask `transitions.ts` whether the operation is allowed,
 * and write what it allowed. The rules are not in this file; the SQL is the
 * part that could not be anything else. `store.server.ts` owns the rows, so
 * an approval can be read or written in exactly one place.
 */

import { canonicalJson } from "@becomeopc/dshx-hub-contracts";
import type { BatchItem } from "drizzle-orm/batch";

import type {
  ApprovalCreateInput,
  ApprovalDecisionInput,
  ApprovalRevisionInput,
} from "./contracts";
import {
  assertEffectSubject,
  registeredEffect,
  validateRegisteredEffect,
  validateRegisteredPreconditions,
} from "./effects.server";
import {
  approvalList,
  approvalSubject,
  approvalTrail,
  effectOutcomeStatements,
  effectRow,
  eventStatement,
  markSuperseded,
  parseJson,
  requestRow,
  requesterApprovalList,
  requesterNotification,
  toEffect,
  toRequest,
  versionRow,
  type EffectRow,
  type RequestRow,
  type VersionRow,
} from "./store.server";
import {
  APPROVAL_LIFETIME_MS,
  claim,
  complete,
  decide,
  execute,
  retry,
  revise,
  type Evidence,
  type Transition,
} from "./transitions";
import { randomToken, sha256 } from "@/lib/auth/tokens.server";
import { refreshPluginScore } from "@/lib/catalog/scores.server";
import { runDrizzleBatch } from "@/lib/db/batch";
import type { Database } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";
import { HttpError, uuid } from "@/lib/http";

/** The requester of an approval: the API token that asked and the role behind it. */
export type TokenActor = {
  token: { id: string; userId: string };
  profile: { role: string };
};

/**
 * Persist what a refusal implies, then raise it.
 *
 * Stale evidence is the one refusal with a write of its own: the request is
 * superseded before the 409 goes out, so a subject that moved past what was
 * reviewed cannot be decided by anyone afterwards — least of all by a retry
 * that carries the same stale evidence.
 */
async function applyTransition<Value>(
  binding: Database,
  request: RequestRow,
  transition: Transition<Value>,
  evidence?: Evidence,
): Promise<Value> {
  if (transition.outcome === "allowed") return transition.next;
  const { httpStatus, code, message, supersede } = transition.refusal;
  if (supersede && evidence) await markSuperseded(binding, request.id, evidence.current);
  throw new HttpError(httpStatus, message, code);
}

type Sealed = {
  request: RequestRow;
  version: VersionRow;
  effect: EffectRow;
  subject: { state: Record<string, unknown>; fingerprint: string };
  /** The effect input this version recorded, re-parsed through the registry. */
  input: Record<string, unknown>;
};

/**
 * Everything an approved action rests on, in one read.
 *
 * Whether that evidence still holds is the state machine's call; this only
 * supplies the two fingerprints it compares.
 */
async function loadSealed(binding: Database, id: string): Promise<Sealed> {
  const request = await requestRow(binding, id);
  const version = await versionRow(binding, request);
  const effect = await effectRow(binding, id);
  const subject = await approvalSubject(binding, request.subject_type, request.subject_id);
  const input = validateRegisteredEffect(
    request.effect_kind,
    request.execution_mode,
    parseJson<Record<string, unknown>>(version.effect_input_json, {}),
  ).input;
  return { request, version, effect, subject, input };
}

function evidenceOf(sealed: Sealed): Evidence {
  return { current: sealed.subject.fingerprint, approved: sealed.version.source_hash };
}

/** The preconditions the reviewed version recorded must still hold. */
function assertPreconditionsHold(sealed: Sealed): void {
  validateRegisteredPreconditions(
    sealed.request.effect_kind,
    sealed.subject.state,
    parseJson<Record<string, unknown>>(sealed.version.preconditions_json, {}),
    sealed.input,
  );
}

type Requester =
  { type: "api_token"; userId: string; tokenId: string } | { type: "user"; userId: string };

/**
 * The one creation path.
 *
 * A request filed by an API token and one filed by a person differ only in who
 * is told afterwards; both validate the effect, fingerprint the subject, check
 * the preconditions, and write the same four rows. Two copies of that meant
 * every change to it had to be made twice.
 */
async function insertApproval(
  binding: Database,
  requester: Requester,
  input: ApprovalCreateInput,
): Promise<{ id: string; duplicate: boolean }> {
  const existing = await binding.get<{ id: string }>(
    parameterizedSql("select id from approval_requests where idempotency_key=?", [
      input.idempotencyKey,
    ]),
  );
  if (existing) return { id: existing.id, duplicate: true };

  assertEffectSubject(input.effect.kind, input.effect.input, input.subjectType, input.subjectId);
  const validated = validateRegisteredEffect(
    input.effect.kind,
    input.effect.executionMode,
    input.effect.input,
  );
  const subject = await approvalSubject(binding, input.subjectType, input.subjectId);
  const preconditions = validateRegisteredPreconditions(
    input.effect.kind,
    subject.state,
    input.preconditions,
    validated.input,
  );
  if (input.sourceHash && input.sourceHash !== subject.fingerprint)
    throw new HttpError(409, "Approval subject changed before creation", "approval_source_changed");

  const id = uuid();
  const now = Date.now();
  await runDrizzleBatch(binding, [
    binding.run(
      parameterizedSql(
        `insert into approval_requests(
          id,kind,risk,status,requester_type,requester_id,requester_token_id,run_id,
          subject_type,subject_id,current_version,execution_mode,effect_kind,effect_status,
          idempotency_key,expires_at,created_at,updated_at
        ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          input.kind,
          input.risk,
          "pending",
          requester.type,
          requester.userId,
          requester.type === "api_token" ? requester.tokenId : null,
          input.runId ?? null,
          input.subjectType,
          input.subjectId,
          1,
          input.effect.executionMode,
          input.effect.kind,
          "pending",
          input.idempotencyKey,
          now + APPROVAL_LIFETIME_MS,
          now,
          now,
        ],
      ),
    ),
    binding.run(
      parameterizedSql(
        `insert into approval_request_versions(
          request_id,version,title,summary,evidence_json,effect_input_json,preconditions_json,
          source_hash,policy_version,created_by_type,created_by_id,created_at
        ) values(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          1,
          input.title,
          input.summary,
          JSON.stringify(input.evidence),
          JSON.stringify(validated.input),
          JSON.stringify(preconditions),
          subject.fingerprint,
          input.policyVersion,
          requester.type,
          requester.type === "api_token" ? requester.tokenId : requester.userId,
          now,
        ],
      ),
    ),
    binding.run(
      parameterizedSql(
        `insert into approval_effects(request_id,version,effect_kind,execution_mode,status,attempt_count,updated_at)
         values(?,?,?,?,?,?,?)`,
        [id, 1, input.effect.kind, input.effect.executionMode, "pending", 0, now],
      ),
    ),
    eventStatement(binding, id, {
      kind: "created",
      actorType: requester.type,
      actorId: requester.type === "api_token" ? requester.tokenId : requester.userId,
      payload: { state: subject.state },
      now,
    }),
  ]);
  return { id, duplicate: false };
}

export async function createApproval(
  binding: Database,
  actor: TokenActor,
  input: ApprovalCreateInput,
) {
  const { id } = await insertApproval(
    binding,
    { type: "api_token", userId: actor.token.userId, tokenId: actor.token.id },
    input,
  );
  return getRequesterApproval(binding, id, actor);
}

export async function createUserApproval(
  binding: Database,
  userId: string,
  input: ApprovalCreateInput,
) {
  return insertApproval(binding, { type: "user", userId }, input);
}

export async function listApprovals(
  binding: Database,
  options: {
    status?: string | null | undefined;
    kind?: string | null | undefined;
    risk?: string | null | undefined;
    limit?: number | undefined;
  },
) {
  return approvalList(binding, options);
}

export async function listActorApprovals(binding: Database, actor: TokenActor) {
  return { items: await requesterApprovalList(binding, actor.token.id) };
}

/** The full ledger: every version, decision, event and attempt, plus the preview. */
async function approvalDetail(binding: Database, request: RequestRow) {
  const current = await versionRow(binding, request);
  const effect = await effectRow(binding, request.id);
  const trail = await approvalTrail(binding, request.id);
  const effectInput = parseJson<Record<string, unknown>>(current.effect_input_json, {});
  return {
    request,
    current: {
      ...current,
      evidence: parseJson(current.evidence_json, {}),
      effectInput,
      preconditions: parseJson(current.preconditions_json, {}),
      preview: registeredEffect(effect.effect_kind).preview(effectInput),
    },
    effect,
    ...trail,
  };
}

/** What a requester may see of their own request. */
async function requesterView(binding: Database, request: RequestRow) {
  const current = await versionRow(binding, request);
  const effect = await effectRow(binding, request.id);
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

/** The ledger view an administrator works from. */
export async function getApprovalDetail(binding: Database, id: string) {
  return approvalDetail(binding, await requestRow(binding, id));
}

/**
 * The view a requester gets of their own request.
 *
 * The whole `/api/ops` family answers in this shape, including the list, so a
 * caller can poll its own request with the same parser it created it with.
 * The ledger is the administrators' endpoint, not this one.
 */
export async function getRequesterApproval(binding: Database, id: string, actor: TokenActor) {
  const request = await requestRow(binding, id);
  const owns = request.requester_token_id === actor.token.id;
  if (!owns && actor.profile.role !== "admin")
    throw new HttpError(403, "Approval is not visible to this token", "approval_forbidden");
  return requesterView(binding, request);
}

export async function reviseApproval(
  binding: Database,
  id: string,
  actor: TokenActor,
  input: ApprovalRevisionInput,
) {
  const request = await requestRow(binding, id);
  const { version } = await applyTransition(
    binding,
    request,
    revise(toRequest(request), actor.token.id),
  );
  const validated = validateRegisteredEffect(
    request.effect_kind,
    request.execution_mode,
    input.effectInput,
  );
  assertEffectSubject(
    request.effect_kind,
    validated.input,
    request.subject_type,
    request.subject_id,
  );
  const subject = await approvalSubject(binding, request.subject_type, request.subject_id);
  if (input.sourceHash && input.sourceHash !== subject.fingerprint)
    throw new HttpError(409, "Approval subject changed", "approval_source_changed");
  const preconditions = validateRegisteredPreconditions(
    request.effect_kind,
    subject.state,
    input.preconditions,
    validated.input,
  );
  const now = Date.now();
  await runDrizzleBatch(binding, [
    binding.run(
      parameterizedSql(
        `insert into approval_request_versions(
          request_id,version,title,summary,evidence_json,effect_input_json,preconditions_json,
          source_hash,policy_version,created_by_type,created_by_id,created_at
        ) values(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          version,
          input.title,
          input.summary,
          JSON.stringify(input.evidence),
          JSON.stringify(validated.input),
          JSON.stringify(preconditions),
          subject.fingerprint,
          input.policyVersion,
          "api_token",
          actor.token.id,
          now,
        ],
      ),
    ),
    binding.run(
      parameterizedSql(
        "update approval_requests set status='pending',current_version=?,effect_status='pending',expires_at=?,decided_by_user_id=null,decided_at=null,updated_at=? where id=?",
        [version, now + APPROVAL_LIFETIME_MS, now, id],
      ),
    ),
    binding.run(
      parameterizedSql(
        "update approval_effects set version=?,status='pending',lease_token_hash=null,leased_to_token_id=null,lease_expires_at=null,last_error=null,updated_at=? where request_id=?",
        [version, now, id],
      ),
    ),
    eventStatement(binding, id, {
      kind: "revised",
      actorType: "api_token",
      actorId: actor.token.id,
      payload: { version },
      now,
    }),
  ]);
  return getRequesterApproval(binding, id, actor);
}

export async function decideApproval(
  binding: Database,
  id: string,
  adminUserId: string,
  input: ApprovalDecisionInput,
) {
  const sealed = await loadSealed(binding, id);
  const evidence = evidenceOf(sealed);
  const { requestStatus, effectStatus } = await applyTransition(
    binding,
    sealed.request,
    decide(toRequest(sealed.request), input.action, evidence),
    evidence,
  );
  assertPreconditionsHold(sealed);

  const now = Date.now();
  const decisionId = uuid();
  const recorded = parseJson<Record<string, unknown>>(sealed.version.evidence_json, {});
  const appealId = typeof recorded["appealId"] === "string" ? recorded["appealId"] : null;
  const statements: BatchItem<"sqlite">[] = [
    binding.run(
      parameterizedSql(
        "insert into approval_decisions(id,request_id,version,action,admin_user_id,reason,created_at) values(?,?,?,?,?,?,?)",
        [
          decisionId,
          id,
          sealed.request.current_version,
          input.action,
          adminUserId,
          input.reason ?? null,
          now,
        ],
      ),
    ),
    binding.run(
      parameterizedSql(
        "update approval_requests set status=?,effect_status=?,decided_by_user_id=?,decided_at=?,updated_at=? where id=? and status='pending'",
        [requestStatus, effectStatus, adminUserId, now, now, id],
      ),
    ),
    binding.run(
      parameterizedSql(
        "update approval_effects set status=?,last_error=null,updated_at=? where request_id=?",
        [effectStatus, now, id],
      ),
    ),
    eventStatement(binding, id, {
      kind: `decision.${input.action}`,
      actorType: "user",
      actorId: adminUserId,
      payload: { decisionId, reason: input.reason ?? null },
      now,
    }),
    requesterNotification(binding, sealed.request, `approval.${requestStatus}`, {
      id,
      reason: input.reason,
    }),
  ];
  if (appealId && input.action === "reject")
    statements.push(
      binding.run(
        parameterizedSql(
          "update moderation_appeals set status='rejected',resolved_at=? where id=?",
          [now, appealId],
        ),
      ),
    );
  await runDrizzleBatch(binding, statements);
  if (input.action === "approve" && sealed.request.execution_mode === "server")
    await executeServerEffect(
      binding,
      id,
      adminUserId,
      input.reason ?? "Approved by administrator",
    );
  return getApprovalDetail(binding, id);
}

export async function executeServerEffect(
  binding: Database,
  id: string,
  adminUserId: string,
  reason = "Approved effect retry",
) {
  const sealed = await loadSealed(binding, id);
  const evidence = evidenceOf(sealed);
  const { attempt } = await applyTransition(
    binding,
    sealed.request,
    execute(toRequest(sealed.request), toEffect(sealed.effect), evidence),
    evidence,
  );
  assertPreconditionsHold(sealed);

  const definition = registeredEffect(sealed.effect.effect_kind);
  const startedAt = Date.now();
  const inputHash = await sha256(canonicalJson(sealed.input));
  try {
    const domain = definition.prepare?.(binding, sealed.input, adminUserId, reason) ?? [];
    const finishedAt = Date.now();
    const output = { effectKind: sealed.effect.effect_kind, applied: domain.length };
    const statements: BatchItem<"sqlite">[] = [
      ...domain,
      ...effectOutcomeStatements(binding, sealed.request, id, {
        status: "succeeded",
        attempt,
        inputHash,
        output,
        error: null,
        startedAt,
        finishedAt,
        executor: adminUserId,
      }),
    ];
    const recorded = parseJson<Record<string, unknown>>(sealed.version.evidence_json, {});
    if (typeof recorded["appealId"] === "string")
      statements.push(
        binding.run(
          parameterizedSql(
            "update moderation_appeals set status='approved',resolved_at=? where id=?",
            [finishedAt, recorded["appealId"]],
          ),
        ),
      );
    await runDrizzleBatch(binding, statements);
    // Plugin effects (lifecycle, visibility, verification) change ranking
    // facts; refresh the precomputed catalog score for the subject.
    if (sealed.request.subject_type === "plugin")
      await refreshPluginScore(binding, sealed.request.subject_id);
    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = Date.now();
    await runDrizzleBatch(
      binding,
      effectOutcomeStatements(binding, sealed.request, id, {
        status: "failed",
        attempt,
        inputHash,
        output: null,
        error: message,
        startedAt,
        finishedAt,
        executor: adminUserId,
      }),
    );
    throw new HttpError(
      500,
      "Approved effect failed; use explicit retry",
      "approval_effect_failed",
    );
  }
}

export async function retryApprovedEffect(
  binding: Database,
  id: string,
  adminUserId: string,
  reason = "Administrator authorized an explicit effect retry",
) {
  const sealed = await loadSealed(binding, id);
  const evidence = evidenceOf(sealed);
  const { run } = await applyTransition(
    binding,
    sealed.request,
    retry(toRequest(sealed.request), toEffect(sealed.effect), evidence),
    evidence,
  );
  assertPreconditionsHold(sealed);
  if (run === "server") {
    await executeServerEffect(binding, id, adminUserId, reason);
    return getApprovalDetail(binding, id);
  }

  const now = Date.now();
  await runDrizzleBatch(binding, [
    binding.run(
      parameterizedSql(
        "update approval_effects set status='awaiting_agent',lease_token_hash=null,leased_to_token_id=null,lease_expires_at=null,last_error=null,updated_at=? where request_id=? and status='failed'",
        [now, id],
      ),
    ),
    binding.run(
      parameterizedSql(
        "update approval_requests set effect_status='awaiting_agent',updated_at=? where id=? and effect_status='failed'",
        [now, id],
      ),
    ),
    eventStatement(binding, id, {
      kind: "effect.retry_authorized",
      actorType: "user",
      actorId: adminUserId,
      payload: { reason },
      now,
    }),
  ]);
  return getApprovalDetail(binding, id);
}

export async function claimAgentEffect(
  binding: Database,
  id: string,
  actor: TokenActor,
  claimedRunId?: string | null,
) {
  const sealed = await loadSealed(binding, id);
  const now = Date.now();
  const evidence = evidenceOf(sealed);
  const plan = await applyTransition(
    binding,
    sealed.request,
    claim(
      toRequest(sealed.request),
      toEffect(sealed.effect),
      { tokenId: actor.token.id, runId: claimedRunId ?? null },
      evidence,
      now,
    ),
    evidence,
  );
  assertPreconditionsHold(sealed);

  const leaseToken = randomToken("dshx_approval");
  await runDrizzleBatch(binding, [
    binding.run(
      parameterizedSql(
        "update approval_effects set status='running',lease_token_hash=?,leased_to_token_id=?,lease_expires_at=?,last_error=null,updated_at=? where request_id=?",
        [await sha256(leaseToken), actor.token.id, plan.leaseExpiresAt, now, id],
      ),
    ),
    binding.run(
      parameterizedSql(
        "update approval_requests set effect_status='running',updated_at=? where id=?",
        [now, id],
      ),
    ),
    eventStatement(binding, id, {
      kind: "effect.claimed",
      actorType: "api_token",
      actorId: actor.token.id,
      payload: { leaseExpiresAt: plan.leaseExpiresAt },
      now,
    }),
  ]);
  return {
    approvalId: id,
    leaseToken,
    leaseExpiresAt: new Date(plan.leaseExpiresAt).toISOString(),
    attempt: plan.attempt,
    effectKind: sealed.request.effect_kind,
    runId: sealed.request.run_id,
    input: sealed.input,
  };
}

// The return type is explicit so the outcome reaches the API document as the
// two statuses it can be; inferred, the literal would widen to `string`.
export async function completeAgentEffect(
  binding: Database,
  id: string,
  actor: TokenActor,
  input: {
    leaseToken: string;
    status: "succeeded" | "failed";
    output?: unknown;
    error?: string | null | undefined;
  },
): Promise<{ approvalId: string; status: "succeeded" | "failed"; duplicate: boolean }> {
  const request = await requestRow(binding, id);
  const effect = await effectRow(binding, id);
  const leaseMatches =
    Boolean(effect.lease_token_hash) &&
    (await sha256(input.leaseToken)) === effect.lease_token_hash;
  const plan = await applyTransition(
    binding,
    request,
    complete(
      toRequest(request),
      toEffect(effect),
      { tokenId: actor.token.id },
      { status: input.status, leaseMatches },
      Date.now(),
    ),
  );
  if (plan.duplicate) return { approvalId: id, status: "succeeded", duplicate: true };

  const version = await versionRow(binding, request);
  const finishedAt = Date.now();
  await runDrizzleBatch(binding, [
    binding.run(
      parameterizedSql(
        "update approval_effects set status=?,attempt_count=?,lease_token_hash=null,leased_to_token_id=null,lease_expires_at=null,last_error=?,updated_at=? where request_id=?",
        [input.status, plan.attempt, input.error ?? null, finishedAt, id],
      ),
    ),
    binding.run(
      parameterizedSql("update approval_requests set effect_status=?,updated_at=? where id=?", [
        input.status,
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
          plan.attempt,
          "api_token",
          actor.token.id,
          input.status,
          await sha256(version.effect_input_json),
          input.output ? JSON.stringify(input.output) : null,
          input.error ?? null,
          effect.updated_at,
          finishedAt,
        ],
      ),
    ),
    eventStatement(binding, id, {
      kind: `effect.${input.status}`,
      actorType: "api_token",
      actorId: actor.token.id,
      payload: { output: input.output ?? null, error: input.error ?? null },
      now: finishedAt,
    }),
    requesterNotification(binding, request, `approval.effect_${input.status}`, { id }),
  ]);
  return { approvalId: id, status: input.status, duplicate: false };
}
