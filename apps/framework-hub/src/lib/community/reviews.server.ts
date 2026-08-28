import { and, eq, isNull, or, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import {
  pluginMaintainers,
  pluginReviews,
  plugins,
  reviewReplies,
  userBlocks,
} from "@/lib/db/schema";
import { HttpError } from "@/lib/http";

export async function requireReviewablePlugin(db: Database, slug: string, userId: string) {
  const [plugin] = await db.select().from(plugins).where(eq(plugins.slug, slug)).limit(1);
  if (!plugin) throw new HttpError(404, "Plugin not found", "plugin_not_found");
  const [maintainer] = await db
    .select()
    .from(pluginMaintainers)
    .where(
      and(
        eq(pluginMaintainers.pluginId, plugin.id),
        eq(pluginMaintainers.userId, userId),
        isNull(pluginMaintainers.revokedAt),
      ),
    )
    .limit(1);
  if (maintainer)
    throw new HttpError(
      403,
      "Maintainers cannot review their own plugin",
      "maintainer_review_forbidden",
    );
  return plugin;
}

export async function upsertPluginReview(
  db: Database,
  input: {
    id: string;
    pluginId: string;
    userId: string;
    rating: number;
    locale: "en" | "zh";
    body: string | null;
    idempotencyKey: string;
  },
) {
  const [review] = await db
    .insert(pluginReviews)
    .values(input)
    .onConflictDoUpdate({
      target: [pluginReviews.pluginId, pluginReviews.userId],
      set: {
        rating: input.rating,
        locale: input.locale,
        body: input.body,
        idempotencyKey: input.idempotencyKey,
        // Authors may republish their own deleted review, but moderation-hidden
        // content can only be restored by an approved restore_content effect.
        status: sql`case when ${pluginReviews.status} = 'deleted' then 'published' else ${pluginReviews.status} end`,
        deletedAt: sql`case when ${pluginReviews.status} = 'deleted' then null else ${pluginReviews.deletedAt} end`,
        updatedAt: new Date(),
      },
    })
    .returning();
  return review!;
}

export async function softDeletePluginReview(db: Database, pluginId: string, userId: string) {
  const [review] = await db
    .update(pluginReviews)
    .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(pluginReviews.pluginId, pluginId),
        eq(pluginReviews.userId, userId),
        eq(pluginReviews.status, "published"),
      ),
    )
    .returning();
  if (review) return review;
  const [existing] = await db
    .select({ status: pluginReviews.status })
    .from(pluginReviews)
    .where(and(eq(pluginReviews.pluginId, pluginId), eq(pluginReviews.userId, userId)))
    .limit(1);
  if (existing?.status === "hidden")
    throw new HttpError(
      409,
      "Moderation-hidden reviews cannot be changed without approval",
      "approval_required",
    );
  throw new HttpError(404, "Review not found", "review_not_found");
}

export async function listPublishedPluginReviews(
  db: Database,
  input: { slug: string; cursor: number; limit: number },
) {
  return db.all<{ created_at: number } & Record<string, unknown>>(sql`
    select r.id, r.rating, r.locale, r.body, r.created_at, r.updated_at,
      u.name as user_name, u.image as user_image,
      (select json_group_array(json_object('id', rr.id, 'locale', rr.locale, 'body', rr.body,
        'createdAt', rr.created_at, 'userName', ru.name))
       from review_replies rr join user ru on ru.id = rr.user_id
       where rr.review_id = r.id and rr.status = 'published') as replies
    from plugin_reviews r join plugins p on p.id = r.plugin_id join user u on u.id = r.user_id
    where p.slug = ${input.slug} and r.status = 'published' and r.created_at < ${input.cursor}
    order by r.created_at desc limit ${input.limit + 1}
  `);
}

export async function findPublishedReview(db: Database, id: string) {
  const [review] = await db
    .select()
    .from(pluginReviews)
    .where(and(eq(pluginReviews.id, id), eq(pluginReviews.status, "published")))
    .limit(1);
  return review ?? null;
}

export async function usersBlockEachOther(db: Database, leftUserId: string, rightUserId: string) {
  const [blocked] = await db
    .select({ blockerUserId: userBlocks.blockerUserId })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.blockerUserId, leftUserId), eq(userBlocks.blockedUserId, rightUserId)),
        and(eq(userBlocks.blockerUserId, rightUserId), eq(userBlocks.blockedUserId, leftUserId)),
      ),
    )
    .limit(1);
  return Boolean(blocked);
}

export async function findReplyByIdempotencyKey(db: Database, idempotencyKey: string) {
  const [reply] = await db
    .select()
    .from(reviewReplies)
    .where(eq(reviewReplies.idempotencyKey, idempotencyKey))
    .limit(1);
  return reply ?? null;
}

export async function insertReviewReply(db: Database, value: typeof reviewReplies.$inferInsert) {
  const [reply] = await db.insert(reviewReplies).values(value).returning();
  return reply!;
}

export async function updateOwnedReviewReply(
  db: Database,
  input: { id: string; userId: string; body: string; locale: "en" | "zh" },
) {
  const [reply] = await db
    .update(reviewReplies)
    .set({ body: input.body, locale: input.locale, updatedAt: new Date() })
    .where(
      and(
        eq(reviewReplies.id, input.id),
        eq(reviewReplies.userId, input.userId),
        eq(reviewReplies.status, "published"),
      ),
    )
    .returning();
  return reply ?? null;
}

export async function deleteOwnedReviewReply(db: Database, id: string, userId: string) {
  const [reply] = await db
    .update(reviewReplies)
    .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(reviewReplies.id, id), eq(reviewReplies.userId, userId)))
    .returning();
  return reply ?? null;
}
