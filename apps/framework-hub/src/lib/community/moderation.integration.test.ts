import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { createDatabase, type Database } from "@/lib/db/client";
import { authUsers, contentReports, pluginReviews, plugins, userProfiles } from "@/lib/db/schema";
import { applyModerationAction, listModerationQueue } from "./moderation.server";

describe("community moderation with local D1", () => {
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

  async function createPlugin() {
    const id = crypto.randomUUID();
    await db.insert(plugins).values({
      id,
      slug: `moderation-${id}`,
      identityKey: `npm:@fixture/moderation-${id}`,
      packageName: `@fixture/moderation-${id}`,
      name: "Moderation fixture",
      description: "Moderation fixture",
      authorHandle: "fixture",
      category: "tools",
      latestVersion: "1.0.0",
      compatibilityRange: "*",
      verificationStatus: "verified",
      lifecycleStatus: "active",
      status: "published",
    });
    return id;
  }

  async function createUser(label: string) {
    const id = crypto.randomUUID();
    await db.insert(authUsers).values({
      id,
      name: label,
      email: `${id}@example.test`,
    });
    await db.insert(userProfiles).values({
      userId: id,
      githubId: `github-${id}`,
      githubLogin: `${label}-${id}`,
    });
    return id;
  }

  it("returns complete evidence and dismisses reports atomically", async () => {
    const pluginId = await createPlugin();
    const authorId = await createUser("author");
    const reporters = await Promise.all([createUser("reporter-a"), createUser("reporter-b")]);
    const reviewId = crypto.randomUUID();
    await db.insert(pluginReviews).values({
      id: reviewId,
      pluginId,
      userId: authorId,
      rating: 1,
      locale: "en",
      body: "Ambiguous fixture content",
      idempotencyKey: crypto.randomUUID(),
    });
    const reportIds = [crypto.randomUUID(), crypto.randomUUID()];
    await db.insert(contentReports).values(
      reportIds.map((id, index) => ({
        id,
        reporterUserId: reporters[index]!,
        targetType: "review" as const,
        targetId: reviewId,
        reason: "other" as const,
        details: `evidence-${index}`,
        idempotencyKey: crypto.randomUUID(),
      })),
    );

    const queue = await listModerationQueue(proxy.env.DB);
    expect(queue).toContainEqual(
      expect.objectContaining({
        targetId: reviewId,
        reportCount: 2,
        reportIds: expect.arrayContaining(reportIds),
        content: expect.objectContaining({ body: "Ambiguous fixture content" }),
        author: expect.objectContaining({ userId: authorId }),
        plugin: expect.objectContaining({ id: pluginId }),
      }),
    );
    await applyModerationAction(proxy.env.DB, "operator-token", {
      action: "dismiss",
      targetType: "review",
      targetId: reviewId,
      reason: "insufficient evidence",
      reportIds,
      decisionCode: "insufficient-evidence",
      confidence: 0.98,
      policyVersion: "dshx-community-1",
      metadata: { evidence: "ambiguous" },
    });

    const review = await db.get<{ status: string }>(
      sql`select status from plugin_reviews where id=${reviewId}`,
    );
    const reports = await db.all<{ status: string }>(
      sql`select status from content_reports where id in (${reportIds[0]}, ${reportIds[1]})`,
    );
    const action = await db.get<{ metadata_json: string }>(sql`
      select metadata_json from moderation_actions where target_id=${reviewId} and action='dismiss'
    `);
    expect(review?.status).toBe("published");
    expect(reports.map((report) => report.status)).toEqual(["dismissed", "dismissed"]);
    expect(JSON.parse(action!.metadata_json)).toMatchObject({
      reportIds: expect.arrayContaining(reportIds),
      decisionCode: "insufficient-evidence",
      confidence: 0.98,
      policyVersion: "dshx-community-1",
    });
  });

  it("rolls back content decisions when a related report conflicts", async () => {
    const pluginId = await createPlugin();
    const authorId = await createUser("rollback-author");
    const reporterId = await createUser("rollback-reporter");
    const reviewId = crypto.randomUUID();
    const reportId = crypto.randomUUID();
    await db.insert(pluginReviews).values({
      id: reviewId,
      pluginId,
      userId: authorId,
      rating: 1,
      locale: "en",
      body: "Rollback fixture",
      idempotencyKey: crypto.randomUUID(),
    });
    await db.insert(contentReports).values({
      id: reportId,
      reporterUserId: reporterId,
      targetType: "review",
      targetId: reviewId,
      reason: "spam",
      idempotencyKey: crypto.randomUUID(),
      status: "dismissed",
    });

    await expect(
      applyModerationAction(proxy.env.DB, "operator-token", {
        action: "hide",
        targetType: "review",
        targetId: reviewId,
        reason: "spam evidence",
        reportIds: [reportId],
        decisionCode: "spam",
        confidence: 0.99,
        policyVersion: "dshx-community-1",
      }),
    ).rejects.toThrow("Every report must be open");
    const review = await db.get<{ status: string }>(
      sql`select status from plugin_reviews where id=${reviewId}`,
    );
    expect(review?.status).toBe("published");
  });

  it("applies a temporary restriction with immutable audit metadata", async () => {
    const userId = await createUser("restricted-author");
    const reporterId = await createUser("restricted-reporter");
    const pluginId = await createPlugin();
    const reviewId = crypto.randomUUID();
    const reportId = crypto.randomUUID();
    await db.insert(pluginReviews).values({
      id: reviewId,
      pluginId,
      userId,
      rating: 1,
      locale: "en",
      body: "Confirmed malware link",
      idempotencyKey: crypto.randomUUID(),
    });
    await db.insert(contentReports).values({
      id: reportId,
      reporterUserId: reporterId,
      targetType: "review",
      targetId: reviewId,
      reason: "abuse",
      idempotencyKey: crypto.randomUUID(),
    });
    await applyModerationAction(proxy.env.DB, "operator-token", {
      action: "hide",
      targetType: "review",
      targetId: reviewId,
      reason: "confirmed malware",
      reportIds: [reportId],
      decisionCode: "malware",
      confidence: 0.99,
      policyVersion: "dshx-community-1",
    });
    await applyModerationAction(proxy.env.DB, "operator-token", {
      action: "restrict",
      targetType: "user",
      targetId: userId,
      reason: "confirmed malware",
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      reportIds: [reportId],
      decisionCode: "malware",
      confidence: 0.99,
      policyVersion: "dshx-community-1",
    });

    const profile = await db.get<{ status: string }>(
      sql`select status from user_profiles where user_id=${userId}`,
    );
    const restriction = await db.get<{ expires_at: number }>(sql`
      select expires_at from user_restrictions where user_id=${userId} and revoked_at is null
    `);
    const review = await db.get<{ status: string }>(
      sql`select status from plugin_reviews where id=${reviewId}`,
    );
    expect(profile?.status).toBe("restricted");
    expect(review?.status).toBe("hidden");
    expect(restriction!.expires_at).toBeGreaterThan(Date.now() + 23 * 60 * 60_000);
  });

  it("rejects low-confidence enforcement and non-expiring restrictions", async () => {
    const userId = await createUser("policy-threshold-author");
    const pluginId = await createPlugin();
    const reviewId = crypto.randomUUID();
    await db.insert(pluginReviews).values({
      id: reviewId,
      pluginId,
      userId,
      rating: 1,
      locale: "en",
      body: "Ambiguous content",
      idempotencyKey: crypto.randomUUID(),
    });
    await expect(
      applyModerationAction(proxy.env.DB, "operator-token", {
        action: "hide",
        targetType: "review",
        targetId: reviewId,
        reason: "ambiguous evidence",
        reportIds: [],
        decisionCode: "ambiguous",
        confidence: 0.7,
        policyVersion: "dshx-community-1",
      }),
    ).rejects.toThrow("confidence of at least 0.95");
    await expect(
      applyModerationAction(proxy.env.DB, "operator-token", {
        action: "restrict",
        targetType: "user",
        targetId: userId,
        reason: "confirmed policy violation",
        reportIds: [],
        decisionCode: "malware",
        confidence: 0.99,
        policyVersion: "dshx-community-1",
      }),
    ).rejects.toThrow("must expire");
  });
});
