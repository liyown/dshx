import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { registeredEffect } from "@/lib/approvals/effects.server";
import type { Database } from "@/lib/db/client";
import { runDrizzleBatch } from "@/lib/db/batch";
import { authUsers, pluginReviews, plugins, userProfiles } from "@/lib/db/schema";
import { startLocalD1, type LocalD1Proxy } from "@/test/local-d1";

describe("community enforcement write path", () => {
  let proxy: LocalD1Proxy;
  let db: Database;

  beforeAll(async () => {
    ({ proxy, db } = await startLocalD1(import.meta.url));
  });

  afterAll(async () => proxy.dispose());

  async function createUser(label: string) {
    const id = crypto.randomUUID();
    await db.insert(authUsers).values({ id, name: label, email: `${id}@example.test` });
    await db.insert(userProfiles).values({
      userId: id,
      githubId: `github-${id}`,
      githubLogin: `${label}-${id}`,
    });
    return id;
  }

  async function createHiddenReview(userId: string) {
    const pluginId = crypto.randomUUID();
    await db.insert(plugins).values({
      id: pluginId,
      slug: `enforcement-${pluginId}`,
      identityKey: `npm:@fixture/enforcement-${pluginId}`,
      packageName: `@fixture/enforcement-${pluginId}`,
      name: "Enforcement fixture",
      description: "Enforcement fixture",
      authorHandle: "fixture",
      category: "tools",
      latestVersion: "1.0.0",
      compatibilityRange: "*",
      verificationStatus: "verified",
      lifecycleStatus: "active",
      status: "published",
    });
    const reviewId = crypto.randomUUID();
    await db.insert(pluginReviews).values({
      id: reviewId,
      pluginId,
      userId,
      rating: 2,
      locale: "en",
      body: "Hidden review awaiting an approved restore.",
      status: "hidden",
      idempotencyKey: crypto.randomUUID(),
    });
    return reviewId;
  }

  it("restores content and records the decision in one batch", async () => {
    const userId = await createUser("appealing-author");
    const reviewId = await createHiddenReview(userId);

    const restore = registeredEffect("restore_content");
    await runDrizzleBatch(
      db,
      restore.prepare!(db, { targetType: "review", targetId: reviewId }, userId, "Approved appeal"),
    );

    const review = await db.get<{ status: string }>(
      sql`select status from plugin_reviews where id=${reviewId}`,
    );
    expect(review?.status).toBe("published");
    const record = await db.get<{ actor_type: string; action: string; metadata_json: string }>(
      sql`select actor_type,action,metadata_json from moderation_actions
        where target_type='review' and target_id=${reviewId} order by created_at desc limit 1`,
    );
    expect(record).toMatchObject({ actor_type: "user", action: "restore" });
    expect(JSON.parse(record!.metadata_json)).toEqual({ source: "approval" });
  });

  it("bans and lifts access through the same statements an operator uses", async () => {
    const userId = await createUser("access-target");
    const ban = registeredEffect("set_user_access");
    const input = { userId, action: "ban", reason: "Confirmed abuse" };
    await runDrizzleBatch(db, ban.prepare!(db, input, userId, "Approved ban"));

    const banned = await db.get<{ status: string }>(
      sql`select status from user_profiles where user_id=${userId}`,
    );
    expect(banned?.status).toBe("banned");
    const restriction = await db.get<{ kind: string; created_by_actor_type: string }>(
      sql`select kind,created_by_actor_type from user_restrictions
        where user_id=${userId} and revoked_at is null`,
    );
    expect(restriction).toMatchObject({ kind: "ban", created_by_actor_type: "user" });

    await runDrizzleBatch(
      db,
      ban.prepare!(db, { userId, action: "unban", reason: "Appeal approved" }, userId, "Appeal"),
    );
    const lifted = await db.get<{ status: string }>(
      sql`select status from user_profiles where user_id=${userId}`,
    );
    expect(lifted?.status).toBe("active");
    const open = await db.all(
      sql`select id from user_restrictions where user_id=${userId} and revoked_at is null`,
    );
    expect(open).toEqual([]);
  });
});
