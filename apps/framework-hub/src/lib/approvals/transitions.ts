/**
 * The approval state machine.
 *
 * An approval is the only way to change a role, restore hidden content, ban a
 * user, or force a publication, and those writes cannot be taken back once
 * they land. Which ones may proceed is decided here — data in, data out, no
 * database — so the whole table can be read on one screen and exercised in
 * milliseconds. A caller persists what a transition allows; "no" is part of
 * the outcome rather than an exception thrown halfway through the rules,
 * because some refusals (stale evidence) carry a write of their own.
 */

export type ApprovalStatus =
  | "pending"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "superseded";

export type EffectStatus =
  "pending" | "awaiting_agent" | "running" | "succeeded" | "failed" | "superseded";

export type ExecutionMode = "server" | "agent";
export type DecisionAction = "approve" | "reject" | "request_changes";

/** How long a revision keeps an approval open. */
export const APPROVAL_LIFETIME_MS = 7 * 86_400_000;

/** How long a claim keeps other runs out before the lease lapses. */
export const EFFECT_LEASE_MS = 15 * 60_000;

/** The request, reduced to the columns the rules read. */
export type ApprovalRequest = {
  status: ApprovalStatus;
  executionMode: ExecutionMode;
  requesterTokenId: string | null;
  runId: string | null;
  currentVersion: number;
  expiresAt: number;
};

/** The effect row, reduced the same way. */
export type ApprovalEffect = {
  status: EffectStatus;
  attemptCount: number;
  leaseTokenHash: string | null;
  leasedToTokenId: string | null;
  leaseExpiresAt: number | null;
};

/** The token (and catalog run, when the request names one) asking to act. */
export type Operator = { tokenId: string; runId?: string | null };

/**
 * The subject as approved versus as it is now. The machine compares; it does
 * not hash, so the rule that a moved subject supersedes a request is testable
 * without a crypto runtime.
 */
export type Evidence = { current: string; approved: string };

export type Refusal = {
  httpStatus: number;
  code: string;
  message: string;
  /** The subject moved: the caller supersedes the request before refusing. */
  supersede?: true;
};

export type Transition<Value> =
  { outcome: "allowed"; next: Value } | { outcome: "refused"; refusal: Refusal };

function allowed<Value>(next: Value): Transition<Value> {
  return { outcome: "allowed", next };
}

function refused<Value = never>(
  httpStatus: number,
  code: string,
  message: string,
): Transition<Value> {
  return { outcome: "refused", refusal: { httpStatus, code, message } };
}

/** A request whose evidence no longer describes its subject. */
const STALE: Transition<never> = {
  outcome: "refused",
  refusal: {
    httpStatus: 409,
    code: "approval_superseded",
    message: "Approval evidence is stale",
    supersede: true,
  },
};

function isStale(evidence: Evidence): boolean {
  return evidence.current !== evidence.approved;
}

/**
 * Whether a still-open request has run out of time. Expiry is not a refusal —
 * it is a status the next read records — so it is a question, not a guard.
 */
export function isExpired(request: ApprovalRequest, now: number): boolean {
  return (
    (request.status === "pending" || request.status === "changes_requested") &&
    request.expiresAt <= now
  );
}

/** `changes_requested` → `pending`: a new version resets both the clock and the decision. */
export function revise(
  request: ApprovalRequest,
  actorTokenId: string,
): Transition<{ version: number }> {
  if (request.requesterTokenId !== actorTokenId)
    return refused(403, "approval_forbidden", "Only the requesting token may revise this approval");
  if (request.status !== "changes_requested")
    return refused(409, "approval_not_revisable", "Approval is not awaiting changes");
  return allowed({ version: request.currentVersion + 1 });
}

/**
 * `pending` → decided. The effect follows the decision: approving arms it for
 * the executor, everything else supersedes it so no approver can replay a
 * write the administrator declined.
 */
export function decide(
  request: ApprovalRequest,
  action: DecisionAction,
  evidence: Evidence,
): Transition<{ requestStatus: ApprovalStatus; effectStatus: EffectStatus }> {
  if (request.status !== "pending")
    return refused(409, "approval_not_pending", `Approval is ${request.status}`);
  if (isStale(evidence)) return STALE;
  if (action === "approve")
    return allowed({
      requestStatus: "approved",
      effectStatus: request.executionMode === "agent" ? "awaiting_agent" : "pending",
    });
  return allowed({
    requestStatus: action === "reject" ? "rejected" : "changes_requested",
    effectStatus: "superseded",
  });
}

/** An approved server effect that has not run yet, or that failed and is being re-run. */
export function execute(
  request: ApprovalRequest,
  effect: ApprovalEffect,
  evidence: Evidence,
): Transition<{ attempt: number }> {
  if (request.status !== "approved" || request.executionMode !== "server")
    return refused(409, "effect_not_runnable", "Approval has no runnable server effect");
  if (effect.status !== "pending" && effect.status !== "failed")
    return refused(409, "effect_not_runnable", `Effect is ${effect.status}`);
  if (isStale(evidence)) return STALE;
  return allowed({ attempt: effect.attemptCount + 1 });
}

/**
 * A failed effect is retried only on an administrator's explicit instruction,
 * so a retry starts from `failed` and nowhere else.
 */
export function retry(
  request: ApprovalRequest,
  effect: ApprovalEffect,
  evidence: Evidence,
): Transition<{ run: ExecutionMode }> {
  if (request.status !== "approved")
    return refused(409, "effect_not_runnable", "Approval is not approved");
  if (effect.status !== "failed")
    return refused(409, "effect_not_retryable", `Effect is ${effect.status}`);
  if (isStale(evidence)) return STALE;
  return allowed({ run: request.executionMode });
}

/**
 * Claiming an Agent effect. Only the run that requested it may claim, only one
 * live lease may exist, and a lapsed lease is what makes a claim possible
 * again — the alternative would be an effect stuck `running` forever.
 */
export function claim(
  request: ApprovalRequest,
  effect: ApprovalEffect,
  operator: Operator,
  evidence: Evidence,
  now: number,
): Transition<{ attempt: number; leaseExpiresAt: number }> {
  if (request.status !== "approved" || request.executionMode !== "agent")
    return refused(409, "effect_not_claimable", "Approval has no claimable Agent effect");
  if (request.requesterTokenId !== operator.tokenId)
    return refused(403, "approval_forbidden", "Only the requesting run may claim this effect");
  if (request.runId && request.runId !== (operator.runId ?? null))
    return refused(403, "approval_forbidden", "Effect lease belongs to another catalog run");
  if (isStale(evidence)) return STALE;
  if (effect.status === "succeeded")
    return refused(409, "effect_complete", "Effect already succeeded");
  if (effect.status === "failed")
    return refused(
      409,
      "effect_retry_required",
      "Failed effects require an explicit administrator retry",
    );
  if (effect.status === "running" && (effect.leaseExpiresAt ?? 0) > now)
    return refused(409, "effect_lease_active", "Effect lease is already active");
  if (effect.status !== "awaiting_agent" && effect.status !== "running")
    return refused(409, "effect_not_claimable", `Effect is ${effect.status}`);
  return allowed({ attempt: effect.attemptCount + 1, leaseExpiresAt: now + EFFECT_LEASE_MS });
}

/**
 * Reporting on a claim: the same run, the same lease, and a lease that has not
 * lapsed. A second success for the same effect is the run telling us again,
 * not a new attempt; that is why it is answered here as a duplicate rather
 * than refused as a dead lease.
 */
export function complete(
  request: ApprovalRequest,
  effect: ApprovalEffect,
  operator: Operator,
  report: { status: "succeeded" | "failed"; leaseMatches: boolean },
  now: number,
): Transition<{ duplicate: boolean; attempt: number }> {
  if (request.requesterTokenId !== operator.tokenId)
    return refused(403, "approval_forbidden", "Effect lease belongs to another run");
  if (effect.status === "succeeded" && report.status === "succeeded")
    return allowed({ duplicate: true, attempt: effect.attemptCount });
  if (effect.leasedToTokenId !== operator.tokenId)
    return refused(403, "approval_forbidden", "Effect lease belongs to another run");
  if (effect.status !== "running" || !effect.leaseTokenHash || !report.leaseMatches)
    return refused(409, "effect_lease_invalid", "Effect lease is invalid");
  if ((effect.leaseExpiresAt ?? 0) <= now)
    return refused(409, "effect_lease_expired", "Effect lease expired");
  return allowed({ duplicate: false, attempt: effect.attemptCount + 1 });
}
