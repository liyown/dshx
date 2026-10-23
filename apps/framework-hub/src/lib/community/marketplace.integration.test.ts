import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import {
  createCollection,
  getCollection,
  listCollections,
  setCollectionPlugin,
  updateCollection,
} from "./collections.server";
import {
  anonymizeAccount,
  getMe,
  listRelationships,
  setPluginRelationship,
  setUserBlock,
} from "./membership.server";
import { createAppeal, listAppeals } from "./moderation.server";
import { listNotifications } from "./notifications.server";
import { listSubmissions } from "./submissions.server";
import {
  appealsPageSchema,
  collectionDetailSchema,
  collectionsPageSchema,
  notificationsPageSchema,
  profileSchema,
  relationshipsSchema,
  submissionsPageSchema,
} from "./contracts";
import {
  requireReviewablePlugin,
  softDeletePluginReview,
  upsertPluginReview,
} from "./reviews.server";

import { startLocalD1, type LocalD1Proxy } from "@/test/local-d1";
import type { Database } from "@/lib/db/client";
import {
  authUsers,
  notificationEvents,
  pluginMaintainers,
  pluginReviews,
  plugins,
  moderationActions,
  reviewReplies,
  userProfiles,
} from "@/lib/db/schema";

describe("community marketplace invariants with local D1", () => {
  let proxy: LocalD1Proxy;
  let db: Database;

  beforeAll(async () => {
    ({ proxy, db } = await startLocalD1(import.meta.url));
  });

  afterAll(async () => proxy.dispose());

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
      githubLogin: `${label.toLowerCase()}-${id.slice(0, 8)}`,
      displayName: label,
    });
    return id;
  }

  async function createPlugin() {
    const id = crypto.randomUUID();
    await db.insert(plugins).values({
      id,
      slug: `plugin-${id.slice(0, 8)}`,
      identityKey: `npm:@test/${id}`,
      packageName: `@test/${id}`,
      name: "Community fixture",
      description: "A published plugin used to verify community invariants.",
      authorHandle: "fixture",
      category: "tools",
      latestVersion: "1.0.0",
      compatibilityRange: ">=0.1.0",
      verificationStatus: "verified",
      lifecycleStatus: "active",
      status: "published",
    });
    return id;
  }

  it("keeps reviews unique and prevents maintainers from reviewing their own plugin", async () => {
    const pluginId = await createPlugin();
    const reviewerId = await createUser("Reviewer");
    const maintainerId = await createUser("Maintainer");
    const plugin = await db.query.plugins.findFirst({
      where: (table, { eq }) => eq(table.id, pluginId),
    });
    expect(plugin).toBeTruthy();

    await db.insert(pluginMaintainers).values({
      pluginId,
      userId: maintainerId,
      role: "owner",
      source: "manual",
    });
    await expect(requireReviewablePlugin(db, plugin!.slug, maintainerId)).rejects.toThrow(
      "Maintainers cannot review",
    );
    await expect(requireReviewablePlugin(db, plugin!.slug, reviewerId)).resolves.toMatchObject({
      id: pluginId,
    });

    await db.insert(pluginReviews).values({
      id: crypto.randomUUID(),
      pluginId,
      userId: reviewerId,
      rating: 5,
      locale: "en",
      body: "Specific and useful.",
      idempotencyKey: `review-${crypto.randomUUID()}`,
    });
    await expect(
      db.insert(pluginReviews).values({
        id: crypto.randomUUID(),
        pluginId,
        userId: reviewerId,
        rating: 4,
        locale: "en",
        idempotencyKey: `review-${crypto.randomUUID()}`,
      }),
    ).rejects.toThrow();
  });

  it("does not let an author republish moderation-hidden reviews", async () => {
    const pluginId = await createPlugin();
    const userId = await createUser("Hidden Reviewer");
    const reviewId = crypto.randomUUID();
    await db.insert(pluginReviews).values({
      id: reviewId,
      pluginId,
      userId,
      rating: 1,
      locale: "en",
      body: "Hidden by moderation.",
      status: "hidden",
      idempotencyKey: `review-${crypto.randomUUID()}`,
    });
    const hidden = await upsertPluginReview(db, {
      id: crypto.randomUUID(),
      pluginId,
      userId,
      rating: 2,
      locale: "en",
      body: "Author edited the hidden review.",
      idempotencyKey: `review-${crypto.randomUUID()}`,
    });
    expect(hidden.status).toBe("hidden");

    await expect(softDeletePluginReview(db, pluginId, userId)).rejects.toThrow(
      "cannot be changed without approval",
    );
    expect(
      await db.query.pluginReviews.findFirst({ where: eq(pluginReviews.id, reviewId) }),
    ).toMatchObject({ status: "hidden" });

    await db
      .update(pluginReviews)
      .set({ status: "published" })
      .where(eq(pluginReviews.id, reviewId));
    await softDeletePluginReview(db, pluginId, userId);
    const republished = await upsertPluginReview(db, {
      id: crypto.randomUUID(),
      pluginId,
      userId,
      rating: 4,
      locale: "en",
      body: "Author intentionally republished their deleted review.",
      idempotencyKey: `review-${crypto.randomUUID()}`,
    });
    expect(republished.status).toBe("published");
    expect(republished.deletedAt).toBeNull();
  });

  it("creates an approval-backed appeal with executable status preconditions", async () => {
    const pluginId = await createPlugin();
    const userId = await createUser("Appealing Reviewer");
    const reviewId = crypto.randomUUID();
    const actionId = crypto.randomUUID();
    await db.insert(pluginReviews).values({
      id: reviewId,
      pluginId,
      userId,
      rating: 2,
      locale: "en",
      body: "Hidden review under appeal.",
      status: "hidden",
      idempotencyKey: `review-${crypto.randomUUID()}`,
    });
    await db.insert(moderationActions).values({
      id: actionId,
      actorType: "api_token",
      actorId: "moderator-fixture",
      action: "hide",
      targetType: "review",
      targetId: reviewId,
      reason: "Fixture moderation decision",
      metadataJson: {},
    });
    const appeal = await createAppeal(db, userId, {
      moderationActionId: actionId,
      statement: "The evidence is incomplete and this review should receive administrator review.",
      idempotencyKey: `appeal-${crypto.randomUUID()}`,
    });
    expect(appeal?.["status"]).toBe("pending");
    const approval = await proxy.env.DB.prepare("select status from approval_requests where id=?")
      .bind(String(appeal?.["approval_request_id"]))
      .first<{ status: string }>();
    expect(approval?.status).toBe("pending");
  });

  it("enforces collection privacy, idempotent membership and user blocking", async () => {
    const ownerId = await createUser("Collector");
    const viewerId = await createUser("Viewer");
    const pluginId = await createPlugin();
    const created = await createCollection(db, ownerId, {
      name: "Runtime tools",
      visibility: "public",
    });
    const collectionId = String(created.collection["id"]);

    await setCollectionPlugin(db, collectionId, pluginId, ownerId, true);
    await setCollectionPlugin(db, collectionId, pluginId, ownerId, true);
    expect((await getCollection(db, collectionId)).plugins).toHaveLength(1);
    await updateCollection(db, collectionId, ownerId, { visibility: "private" });
    await expect(getCollection(db, collectionId, viewerId)).rejects.toThrow("Collection not found");
    await expect(getCollection(db, collectionId, ownerId)).resolves.toBeTruthy();

    await expect(setUserBlock(db, ownerId, ownerId, true)).rejects.toThrow("cannot block yourself");
    await expect(setUserBlock(db, ownerId, viewerId, true)).resolves.toMatchObject({
      enabled: true,
    });
    await expect(setUserBlock(db, ownerId, viewerId, false)).resolves.toMatchObject({
      enabled: false,
    });
  });

  it("answers the account pages in the shapes their contracts declare", async () => {
    const userId = await createUser("Contract Reader");
    const pluginId = await createPlugin();
    await setPluginRelationship(db, userId, pluginId, "bookmark", true);
    await db.insert(notificationEvents).values({
      id: crypto.randomUUID(),
      userId,
      kind: "plugin.released",
      subjectType: "plugin",
      subjectId: pluginId,
    });
    const collected = await createCollection(db, userId, {
      name: "Reading list",
      visibility: "public",
    });

    // The page parses these answers with the same schemas; a column that the
    // SQL stops selecting has to fail here rather than in the browser.
    expect(profileSchema.safeParse(await getMe(db, userId)).success).toBe(true);
    expect(relationshipsSchema.safeParse(await listRelationships(db, userId)).success).toBe(true);
    expect(notificationsPageSchema.safeParse(await listNotifications(db, userId)).success).toBe(
      true,
    );
    expect(submissionsPageSchema.safeParse(await listSubmissions(db, userId)).success).toBe(true);
    expect(appealsPageSchema.safeParse(await listAppeals(db, userId)).success).toBe(true);
    expect(collectionsPageSchema.safeParse(await listCollections(db, userId)).success).toBe(true);
    expect(
      collectionDetailSchema.safeParse(await getCollection(db, String(collected.collection["id"])))
        .success,
    ).toBe(true);
  });

  it("revokes private access while retaining anonymized public contributions", async () => {
    const userId = await createUser("Departing");
    const pluginId = await createPlugin();
    const reviewId = crypto.randomUUID();
    await db.insert(pluginReviews).values({
      id: reviewId,
      pluginId,
      userId,
      rating: 3,
      locale: "en",
      body: "Public review retained after deletion.",
      idempotencyKey: `review-${crypto.randomUUID()}`,
    });
    await db.insert(reviewReplies).values({
      id: crypto.randomUUID(),
      reviewId,
      userId,
      locale: "en",
      body: "Public reply retained after deletion.",
      idempotencyKey: `reply-${crypto.randomUUID()}`,
    });
    const privateCollection = await createCollection(db, userId, {
      name: "Private notes",
      visibility: "private",
    });

    await expect(anonymizeAccount(db, userId)).resolves.toEqual({
      deleted: true,
      anonymized: true,
    });
    const profile = await proxy.env.DB.prepare(
      "select github_login,display_name,anonymized_at from user_profiles where user_id=?",
    )
      .bind(userId)
      .first<Record<string, unknown>>();
    expect(profile?.["display_name"]).toBe("Deleted user");
    expect(profile?.["github_login"]).toMatch(/^deleted-/);
    expect(profile?.["anonymized_at"]).toBeTruthy();
    expect(
      await proxy.env.DB.prepare("select id from plugin_reviews where id=?").bind(reviewId).first(),
    ).toBeTruthy();
    expect(
      await proxy.env.DB.prepare("select id from collections where id=?")
        .bind(String(privateCollection.collection["id"]))
        .first(),
    ).toBeNull();
  });
});
