import { and, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { pluginMaintainers, pluginReviews, plugins } from "@/lib/db/schema";
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
