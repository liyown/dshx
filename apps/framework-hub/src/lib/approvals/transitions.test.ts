import { describe, expect, it } from "vitest";

import {
  APPROVAL_LIFETIME_MS,
  EFFECT_LEASE_MS,
  claim,
  complete,
  decide,
  execute,
  isExpired,
  retry,
  revise,
  type ApprovalEffect,
  type ApprovalRequest,
  type Evidence,
  type Transition,
} from "./transitions";

/**
 * The state machine, exercised as a table.
 *
 * These are the rules that decide whether a role change, a restored review, or
 * a forced publication may be written. They used to be reachable only through
 * a local D1 database, which is why the most irreversible path in the system
 * had no test of its own.
 */

const NOW = 1_760_000_000_000;

function request(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    status: "pending",
    executionMode: "server",
    requesterTokenId: "token-1",
    runId: null,
    currentVersion: 1,
    expiresAt: NOW + APPROVAL_LIFETIME_MS,
    ...overrides,
  };
}

function effect(overrides: Partial<ApprovalEffect> = {}): ApprovalEffect {
  return {
    status: "pending",
    attemptCount: 0,
    leaseTokenHash: null,
    leasedToTokenId: null,
    leaseExpiresAt: null,
    ...overrides,
  };
}

const current: Evidence = { current: "hash-a", approved: "hash-a" };
const moved: Evidence = { current: "hash-b", approved: "hash-a" };
const operator = { tokenId: "token-1", runId: null };

function refusalOf<Value>(transition: Transition<Value>) {
  if (transition.outcome === "allowed")
    throw new Error(`expected a refusal, got ${JSON.stringify(transition.next)}`);
  return transition.refusal;
}

function nextOf<Value>(transition: Transition<Value>) {
  if (transition.outcome === "refused")
    throw new Error(`expected an allowance, got ${transition.refusal.code}`);
  return transition.next;
}

describe("deciding", () => {
  it("arms a server effect on approval and a lease on approval of an agent effect", () => {
    expect(nextOf(decide(request(), "approve", current))).toEqual({
      requestStatus: "approved",
      effectStatus: "pending",
    });
    expect(nextOf(decide(request({ executionMode: "agent" }), "approve", current))).toEqual({
      requestStatus: "approved",
      effectStatus: "awaiting_agent",
    });
  });

  it("supersedes the effect when the decision is not an approval", () => {
    expect(nextOf(decide(request(), "reject", current))).toEqual({
      requestStatus: "rejected",
      effectStatus: "superseded",
    });
    expect(nextOf(decide(request(), "request_changes", current))).toEqual({
      requestStatus: "changes_requested",
      effectStatus: "superseded",
    });
  });

  it("refuses a request that was already decided", () => {
    expect(refusalOf(decide(request({ status: "approved" }), "approve", current))).toMatchObject({
      httpStatus: 409,
      code: "approval_not_pending",
    });
  });

  it("refuses a request whose subject moved, and says the caller must supersede it", () => {
    expect(refusalOf(decide(request(), "approve", moved))).toMatchObject({
      httpStatus: 409,
      code: "approval_superseded",
      supersede: true,
    });
  });
});

describe("revising", () => {
  it("opens a new version only for the requester of a request awaiting changes", () => {
    expect(
      nextOf(revise(request({ status: "changes_requested", currentVersion: 2 }), "token-1")),
    ).toEqual({ version: 3 });
  });

  it("refuses another token, and a request that is not awaiting changes", () => {
    expect(refusalOf(revise(request({ status: "changes_requested" }), "token-2"))).toMatchObject({
      httpStatus: 403,
      code: "approval_forbidden",
    });
    expect(refusalOf(revise(request(), "token-1"))).toMatchObject({
      httpStatus: 409,
      code: "approval_not_revisable",
    });
  });
});

describe("executing", () => {
  it("numbers the attempt from the effect's own count", () => {
    expect(nextOf(execute(request({ status: "approved" }), effect(), current))).toEqual({
      attempt: 1,
    });
    expect(
      nextOf(
        execute(
          request({ status: "approved" }),
          effect({ status: "failed", attemptCount: 2 }),
          current,
        ),
      ),
    ).toEqual({ attempt: 3 });
  });

  it("refuses an Agent effect, an unapproved request, and a finished effect", () => {
    expect(
      refusalOf(
        execute(request({ status: "approved", executionMode: "agent" }), effect(), current),
      ),
    ).toMatchObject({ code: "effect_not_runnable" });
    expect(refusalOf(execute(request(), effect(), current))).toMatchObject({
      code: "effect_not_runnable",
    });
    expect(
      refusalOf(execute(request({ status: "approved" }), effect({ status: "succeeded" }), current)),
    ).toMatchObject({ httpStatus: 409, code: "effect_not_runnable" });
  });

  it("refuses a stale subject before the effect runs", () => {
    expect(refusalOf(execute(request({ status: "approved" }), effect(), moved))).toMatchObject({
      code: "approval_superseded",
      supersede: true,
    });
  });
});

describe("retrying", () => {
  it("retries only a failed effect, in the mode the request was filed for", () => {
    expect(
      nextOf(retry(request({ status: "approved" }), effect({ status: "failed" }), current)),
    ).toEqual({ run: "server" });
    expect(
      nextOf(
        retry(
          request({ status: "approved", executionMode: "agent" }),
          effect({ status: "failed" }),
          current,
        ),
      ),
    ).toEqual({ run: "agent" });
  });

  it("refuses an effect that has not failed and a request that was not approved", () => {
    expect(refusalOf(retry(request({ status: "approved" }), effect(), current))).toMatchObject({
      code: "effect_not_retryable",
    });
    expect(
      refusalOf(retry(request({ status: "pending" }), effect({ status: "failed" }), current)),
    ).toMatchObject({ code: "effect_not_runnable" });
  });
});

describe("claiming an agent effect", () => {
  const agent = request({ status: "approved", executionMode: "agent" });
  const awaiting = effect({ status: "awaiting_agent" });

  it("hands the requester a lease of its own", () => {
    expect(nextOf(claim(agent, awaiting, operator, current, NOW))).toEqual({
      attempt: 1,
      leaseExpiresAt: NOW + EFFECT_LEASE_MS,
    });
  });

  it("lets a lapsed lease be claimed again", () => {
    expect(
      nextOf(
        claim(
          agent,
          effect({ status: "running", leaseExpiresAt: NOW - 1, attemptCount: 1 }),
          operator,
          current,
          NOW,
        ),
      ),
    ).toEqual({ attempt: 2, leaseExpiresAt: NOW + EFFECT_LEASE_MS });
  });

  it("refuses a live lease, and an effect that has already finished", () => {
    expect(
      refusalOf(
        claim(
          agent,
          effect({ status: "running", leaseExpiresAt: NOW + 60_000 }),
          operator,
          current,
          NOW,
        ),
      ),
    ).toMatchObject({ httpStatus: 409, code: "effect_lease_active" });
    expect(
      refusalOf(claim(agent, effect({ status: "succeeded" }), operator, current, NOW)),
    ).toMatchObject({ code: "effect_complete" });
    expect(
      refusalOf(claim(agent, effect({ status: "failed" }), operator, current, NOW)),
    ).toMatchObject({
      code: "effect_retry_required",
    });
  });

  it("refuses another token, another run, and a server effect", () => {
    expect(refusalOf(claim(agent, awaiting, { tokenId: "token-2" }, current, NOW))).toMatchObject({
      httpStatus: 403,
      code: "approval_forbidden",
    });
    expect(
      refusalOf(
        claim(
          { ...agent, runId: "run-1" },
          awaiting,
          { tokenId: "token-1", runId: "run-2" },
          current,
          NOW,
        ),
      ),
    ).toMatchObject({ httpStatus: 403, code: "approval_forbidden" });
    expect(
      refusalOf(claim(request({ status: "approved" }), awaiting, operator, current, NOW)),
    ).toMatchObject({ code: "effect_not_claimable" });
  });
});

describe("completing a claim", () => {
  const agent = request({ status: "approved", executionMode: "agent" });
  const running = effect({
    status: "running",
    attemptCount: 1,
    leaseTokenHash: "lease-hash",
    leasedToTokenId: "token-1",
    leaseExpiresAt: NOW + 60_000,
  });

  it("counts the report as the next attempt", () => {
    expect(
      nextOf(complete(agent, running, operator, { status: "succeeded", leaseMatches: true }, NOW)),
    ).toEqual({ duplicate: false, attempt: 2 });
  });

  it("treats a repeated success as the same attempt, not a dead lease", () => {
    expect(
      nextOf(
        complete(
          agent,
          effect({ status: "succeeded", attemptCount: 2 }),
          operator,
          { status: "succeeded", leaseMatches: false },
          NOW,
        ),
      ),
    ).toEqual({ duplicate: true, attempt: 2 });
  });

  it("refuses a foreign lease, a mismatched token, and an expired lease", () => {
    expect(
      refusalOf(
        complete(
          agent,
          running,
          { tokenId: "token-2" },
          { status: "failed", leaseMatches: true },
          NOW,
        ),
      ),
    ).toMatchObject({ httpStatus: 403 });
    expect(
      refusalOf(complete(agent, running, operator, { status: "failed", leaseMatches: false }, NOW)),
    ).toMatchObject({ httpStatus: 409, code: "effect_lease_invalid" });
    expect(
      refusalOf(
        complete(
          agent,
          { ...running, leaseExpiresAt: NOW },
          operator,
          { status: "failed", leaseMatches: true },
          NOW,
        ),
      ),
    ).toMatchObject({ code: "effect_lease_expired" });
  });
});

describe("expiry", () => {
  it("closes open requests only, and only after their window", () => {
    expect(isExpired(request({ expiresAt: NOW }), NOW)).toBe(true);
    expect(isExpired(request({ status: "changes_requested", expiresAt: NOW }), NOW)).toBe(true);
    expect(isExpired(request({ expiresAt: NOW + 1 }), NOW)).toBe(false);
    expect(isExpired(request({ status: "approved", expiresAt: NOW }), NOW)).toBe(false);
  });
});
