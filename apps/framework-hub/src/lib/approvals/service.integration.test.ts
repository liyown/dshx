import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import {
  claimAgentEffect,
  completeAgentEffect,
  createApproval,
  decideApproval,
  getApproval,
  retryApprovedEffect,
  reviseApproval,
} from "./service.server";
import { approvalCreateSchema } from "./contracts";
import { createDatabase, type Database } from "@/lib/db/client";
import { apiTokens, authUsers, userProfiles } from "@/lib/db/schema";

describe("approval ledger and registered effects with local D1", () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
  let db: Database;

  beforeAll(async () => {
    proxy = await getPlatformProxy<Env>({
      configPath: "wrangler.jsonc",
      persist: true,
      remoteBindings: false,
    });
    db = createDatabase(proxy.env.DB);
  });

  afterAll(async () => proxy.dispose());

  async function user(role: "member" | "operator" | "admin" = "member") {
    const id = crypto.randomUUID();
    await db.insert(authUsers).values({ id, name: role, email: `${id}@example.test` });
    await db.insert(userProfiles).values({
      userId: id,
      githubId: `github-${id}`,
      githubLogin: `${role}-${id}`,
      role,
    });
    return id;
  }

  async function tokenActor(userId: string) {
    const id = crypto.randomUUID();
    await db.insert(apiTokens).values({
      id,
      userId,
      label: "approval integration fixture",
      tokenPrefix: `fixture-${id.slice(0, 8)}`,
      tokenHash: `fixture-hash-${id}`,
      scopesJson: ["approvals:write"],
      expiresAt: new Date(Date.now() + 60_000),
    });
    return { token: { id, userId }, profile: { role: "operator" } };
  }

  it("creates idempotently, requests immutable evidence changes, and applies a server effect", async () => {
    const target = await user();
    const admin = await user("admin");
    const actor = await tokenActor(admin);
    const input = approvalCreateSchema.parse({
      kind: "role_change",
      risk: "critical",
      subjectType: "user",
      subjectId: target,
      title: "Grant operator access",
      summary: "The operator role is required for deterministic catalog maintenance.",
      evidence: { ticket: "fixture-1" },
      effect: {
        kind: "set_user_role",
        executionMode: "server",
        input: { userId: target, role: "operator" },
      },
      preconditions: { role: "member" },
      policyVersion: "test-1",
      idempotencyKey: `role:${target}`,
    });

    const created = await createApproval(proxy.env.DB, actor, input);
    const duplicate = await createApproval(proxy.env.DB, actor, input);
    expect(duplicate.id).toBe(created.id);
    await expect(
      createApproval(proxy.env.DB, actor, {
        ...input,
        preconditions: { fieldThatDoesNotExist: true },
        idempotencyKey: `invalid-precondition:${target}`,
      }),
    ).rejects.toThrow("Unknown subject precondition");

    const returned = await decideApproval(proxy.env.DB, created.id!, admin, {
      action: "request_changes",
      reason: "Attach the authorization ticket",
    });
    expect(returned.request!.status).toBe("changes_requested");

    const otherTarget = await user();
    await expect(
      reviseApproval(proxy.env.DB, created.id!, actor, {
        title: input.title,
        summary: input.summary,
        evidence: { ticket: "fixture-1", authorized: true },
        effectInput: { userId: otherTarget, role: "operator" },
        preconditions: input.preconditions,
        policyVersion: "test-2",
      }),
    ).rejects.toThrow("must match its approval subject");

    const revised = await reviseApproval(proxy.env.DB, created.id!, actor, {
      title: input.title,
      summary: input.summary,
      evidence: { ticket: "fixture-1", authorized: true },
      effectInput: input.effect.input,
      preconditions: input.preconditions,
      policyVersion: "test-2",
    });
    expect(revised.status).toBe("pending");
    expect(revised.currentVersion).toBe(2);

    const approved = await decideApproval(proxy.env.DB, created.id!, admin, {
      action: "approve",
      reason: "Authorization verified",
    });
    expect(approved.effect!.status).toBe("succeeded");
    const profile = await proxy.env.DB.prepare("select role from user_profiles where user_id=?")
      .bind(target)
      .first<{ role: string }>();
    expect(profile?.role).toBe("operator");
    await expect(
      proxy.env.DB.prepare("update approval_decisions set reason='mutated' where request_id=?")
        .bind(created.id)
        .run(),
    ).rejects.toThrow();
  });

  it("supersedes stale evidence and accepts repeated Agent success results idempotently", async () => {
    const target = await user();
    const admin = await user("admin");
    const actor = await tokenActor(admin);
    const stale = await createApproval(
      proxy.env.DB,
      actor,
      approvalCreateSchema.parse({
        kind: "role_change",
        risk: "critical",
        subjectType: "user",
        subjectId: target,
        title: "Change a stale target",
        summary: "This request will become stale before an administrator decides it.",
        evidence: {},
        effect: {
          kind: "set_user_role",
          executionMode: "server",
          input: { userId: target, role: "operator" },
        },
        preconditions: {},
        policyVersion: "test-1",
        idempotencyKey: `stale:${target}`,
      }),
    );
    await proxy.env.DB.prepare(
      "update user_profiles set bio='changed',updated_at=? where user_id=?",
    )
      .bind(Date.now(), target)
      .run();
    await expect(
      decideApproval(proxy.env.DB, stale.id!, admin, { action: "approve" }),
    ).rejects.toThrow("stale");
    expect((await getApproval(proxy.env.DB, stale.id!, undefined, true)).request!.status).toBe(
      "superseded",
    );

    const agentRequest = await createApproval(
      proxy.env.DB,
      actor,
      approvalCreateSchema.parse({
        kind: "ops_exception",
        risk: "high",
        subjectType: "user",
        subjectId: target,
        title: "Resolve an operations exception",
        summary: "The requesting run needs a bounded structured decision from an administrator.",
        evidence: { exception: "fixture" },
        effect: {
          kind: "resolve_ops_exception",
          executionMode: "agent",
          input: { decision: "continue" },
        },
        preconditions: {},
        policyVersion: "test-1",
        idempotencyKey: `agent:${target}`,
      }),
    );
    await decideApproval(proxy.env.DB, agentRequest.id!, admin, { action: "approve" });
    const lease = await claimAgentEffect(proxy.env.DB, agentRequest.id!, actor);
    const result = await completeAgentEffect(proxy.env.DB, agentRequest.id!, actor, {
      leaseToken: lease.leaseToken,
      status: "succeeded",
      output: { resumed: true },
    });
    expect(result.duplicate).toBe(false);
    expect(
      (
        await completeAgentEffect(proxy.env.DB, agentRequest.id!, actor, {
          leaseToken: lease.leaseToken,
          status: "succeeded",
          output: { resumed: true },
        })
      ).duplicate,
    ).toBe(true);
  });

  it("checks Agent drift and requires an administrator to authorize a failed retry", async () => {
    const target = await user();
    const admin = await user("admin");
    const actor = await tokenActor(admin);
    const makeRequest = async (suffix: string) => {
      const request = await createApproval(
        proxy.env.DB,
        actor,
        approvalCreateSchema.parse({
          kind: "ops_exception",
          risk: "high",
          subjectType: "user",
          subjectId: target,
          title: "Resolve a bounded operations exception",
          summary: "The requesting run needs an explicit structured administrator decision.",
          evidence: { suffix },
          effect: {
            kind: "resolve_ops_exception",
            executionMode: "agent",
            input: { decision: "continue" },
          },
          preconditions: { status: "active" },
          policyVersion: "test-1",
          idempotencyKey: `agent-${suffix}:${target}`,
        }),
      );
      await decideApproval(proxy.env.DB, request.id!, admin, { action: "approve" });
      return request;
    };

    const stale = await makeRequest("stale");
    await proxy.env.DB.prepare("update user_profiles set updated_at=? where user_id=?")
      .bind(Date.now() + 1_000, target)
      .run();
    await expect(claimAgentEffect(proxy.env.DB, stale.id!, actor)).rejects.toThrow("stale");
    expect((await getApproval(proxy.env.DB, stale.id!, undefined, true)).request!.status).toBe(
      "superseded",
    );

    const failed = await makeRequest("failed");
    const firstLease = await claimAgentEffect(proxy.env.DB, failed.id!, actor);
    await completeAgentEffect(proxy.env.DB, failed.id!, actor, {
      leaseToken: firstLease.leaseToken,
      status: "failed",
      error: "fixture failure",
    });
    await expect(claimAgentEffect(proxy.env.DB, failed.id!, actor)).rejects.toThrow(
      "administrator retry",
    );
    const retried = await retryApprovedEffect(proxy.env.DB, failed.id!, admin, "Retry verified");
    expect(retried.effect!.status).toBe("awaiting_agent");
    await expect(claimAgentEffect(proxy.env.DB, failed.id!, actor)).resolves.toMatchObject({
      attempt: 2,
    });
  });
});
