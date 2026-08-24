import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { applyModerationAction, listModerationQueue } from "@/lib/community/moderation.server";
import { createDatabase, type Database } from "@/lib/db/client";
import {
  authUsers,
  contentReports,
  pluginMetricDaily,
  pluginReviews,
  plugins,
  userProfiles,
} from "@/lib/db/schema";
import { auditMaintenance, storeMetricSnapshots } from "./operations.server";
import { commitTargetVerification } from "./verification.server";

describe("catalog operations with local D1", () => {
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

  afterAll(async () => {
    await proxy.dispose();
  });

  async function createPlugin() {
    const id = crypto.randomUUID();
    await db.insert(plugins).values({
      id,
      slug: `operations-${id}`,
      identityKey: `npm:@fixture/operations-${id}`,
      packageName: `@fixture/operations-${id}`,
      name: "Operations fixture",
      description: "Operations fixture",
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

  it("upserts daily metrics idempotently and computes server-side trends", async () => {
    const pluginId = await createPlugin();
    await db.insert(pluginMetricDaily).values({
      pluginId,
      snapshotDate: "2026-08-16",
      githubStars: 10,
      githubForks: 2,
      githubOpenIssues: 1,
      npmDownloadsDay: 5,
      npmDownloadsWeek: 50,
      trendScore7d: 0,
      trendScore30d: 0,
    });
    const snapshot = {
      pluginId,
      snapshotDate: "2026-08-23",
      githubStars: 12,
      githubForks: 3,
      githubOpenIssues: 2,
      npmDownloadsDay: 7,
      npmDownloadsWeek: 100,
    };
    const first = await storeMetricSnapshots(proxy.env.DB, db, [snapshot]);
    const second = await storeMetricSnapshots(proxy.env.DB, db, [snapshot]);
    expect(first.snapshots[0]).toMatchObject({ trendScore7d: 271, trendScore30d: 251 });
    expect(second.snapshots[0]).toMatchObject({ trendScore7d: 271, trendScore30d: 251 });
    const count = await db.get<{ count: number }>(sql`
      select count(*) count from plugin_metric_daily where plugin_id=${pluginId}
    `);
    expect(count?.count).toBe(2);
  });

  it("keeps target submissions idempotent and unpublishes only after three full failures", async () => {
    const pluginId = await createPlugin();
    const repositoryId = `repository:${crypto.randomUUID()}`;
    const repositoryPackageId = `package:${crypto.randomUUID()}:`;
    const now = Date.now();
    await proxy.env.DB.batch([
      proxy.env.DB.prepare(
        `insert into repositories(
            id,github_id,owner_login,name,full_name,canonical_url,default_branch,
            is_fork,is_archived,is_disabled,stars,forks,open_issues,created_at,updated_at
          ) values(?,?,?,?,?,?,?,0,0,0,0,0,0,?,?)`,
      ).bind(
        repositoryId,
        crypto.randomUUID(),
        "fixture",
        "target-fixture",
        `fixture/target-${pluginId}`,
        "https://github.com/fixture/target",
        "main",
        now,
        now,
      ),
      proxy.env.DB.prepare(
        `insert into repository_packages(
            id,repository_id,subdirectory,package_name,package_json_sha,patch_path,
            install_kind,install_spec,dsh_bundle,dshx_detected,qualification_status,
            consecutive_failures,verified_at,created_at,updated_at
          ) values(?,?,?,?,'${"c".repeat(64)}','dsh.patch.json','npm',?,1,0,'verified',0,?,?,?)`,
      ).bind(
        repositoryPackageId,
        repositoryId,
        "",
        `@fixture/target-${pluginId}`,
        `@fixture/target-${pluginId}@1.0.0`,
        now,
        now,
        now,
      ),
      proxy.env.DB.prepare(
        `insert into plugin_install_targets(
            id,plugin_id,repository_package_id,kind,spec,package_name,version,is_primary,
            status,verified_at,created_at,updated_at
          ) values(?,?,?,?,?,?,?,1,'active',?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        pluginId,
        repositoryPackageId,
        "npm",
        `@fixture/target-${pluginId}@1.0.0`,
        `@fixture/target-${pluginId}`,
        "1.0.0",
        now,
        now,
        now,
      ),
      proxy.env.DB.prepare("update plugins set primary_repository_package_id=? where id=?").bind(
        repositoryPackageId,
        pluginId,
      ),
    ]);
    const input = (key: string) => ({
      schemaVersion: 2 as const,
      idempotencyKey: key,
      checkedAt: new Date().toISOString(),
      results: [
        {
          schemaVersion: 2 as const,
          repositoryPackageId,
          status: "fail" as const,
          sources: [
            {
              kind: "registry",
              purpose: "verification" as const,
              url: "https://example.test/package.tgz",
              observedAt: new Date().toISOString(),
              sha256: "b".repeat(64),
            },
          ],
          verification: null,
          checks: [
            {
              code: "install_target.full",
              status: "fail" as const,
              message: "target was unavailable during a complete check",
            },
          ],
        },
      ],
    });
    const first = input(`target-one-${pluginId}`);
    await commitTargetVerification(proxy.env.DB, first);
    expect((await commitTargetVerification(proxy.env.DB, first)).duplicate).toBe(true);
    const conflicting = structuredClone(first);
    conflicting.checkedAt = new Date(Date.now() + 1_000).toISOString();
    await expect(commitTargetVerification(proxy.env.DB, conflicting)).rejects.toMatchObject({
      code: "idempotency_conflict",
    });
    await commitTargetVerification(proxy.env.DB, input(`target-two-${pluginId}`));
    await commitTargetVerification(proxy.env.DB, input(`target-three-${pluginId}`));
    const state = await proxy.env.DB.prepare(
      `select rp.consecutive_failures failures,rp.qualification_status qualification,
          p.lifecycle_status lifecycle from repository_packages rp
          join plugins p on p.primary_repository_package_id=rp.id where rp.id=?`,
    )
      .bind(repositoryPackageId)
      .first<{ failures: number; qualification: string; lifecycle: string }>();
    expect(state).toEqual({ failures: 3, qualification: "unavailable", lifecycle: "unavailable" });
  });

  it("reports critical and warning maintenance defects without mutating them", async () => {
    const pluginId = await createPlugin();
    const audit = await auditMaintenance(db, proxy.env.PLUGIN_MEDIA, "full");
    expect(audit.critical.some((issue) => issue.code === "localization.not_ready")).toBe(true);
    expect(audit.warnings.some((issue) => issue.code === "metrics.stale_over_48h")).toBe(true);
    const localizations = await db.get<{ count: number }>(sql`
      select count(*) count from plugin_localizations where plugin_id=${pluginId}
    `);
    expect(localizations?.count).toBe(0);
  });

  it("returns complete moderation evidence and dismisses reports atomically", async () => {
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
      sql`select status from content_reports where id in (${reportIds[0]},${reportIds[1]})`,
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

  it("applies a temporary write restriction and immutable audit metadata", async () => {
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

  it("rejects low-confidence enforcement and non-expiring automatic restrictions", async () => {
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
