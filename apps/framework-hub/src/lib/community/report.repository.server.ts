import { and, eq } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import {
  collections,
  contentReports,
  pluginReviews,
  plugins,
  reviewReplies,
  userProfiles,
} from "@/lib/db/schema";

export type ReportTargetType = "plugin" | "review" | "reply" | "profile" | "collection";

export async function reportTargetExists(
  db: Database,
  targetType: ReportTargetType,
  targetId: string,
): Promise<boolean> {
  switch (targetType) {
    case "plugin":
      return Boolean(
        (
          await db.select({ id: plugins.id }).from(plugins).where(eq(plugins.id, targetId)).limit(1)
        )[0],
      );
    case "review":
      return Boolean(
        (
          await db
            .select({ id: pluginReviews.id })
            .from(pluginReviews)
            .where(eq(pluginReviews.id, targetId))
            .limit(1)
        )[0],
      );
    case "reply":
      return Boolean(
        (
          await db
            .select({ id: reviewReplies.id })
            .from(reviewReplies)
            .where(eq(reviewReplies.id, targetId))
            .limit(1)
        )[0],
      );
    case "profile":
      return Boolean(
        (
          await db
            .select({ id: userProfiles.userId })
            .from(userProfiles)
            .where(eq(userProfiles.userId, targetId))
            .limit(1)
        )[0],
      );
    case "collection":
      return Boolean(
        (
          await db
            .select({ id: collections.id })
            .from(collections)
            .where(eq(collections.id, targetId))
            .limit(1)
        )[0],
      );
  }
}

export async function findReportByIdempotencyKey(
  db: Database,
  reporterUserId: string,
  idempotencyKey: string,
) {
  const [report] = await db
    .select()
    .from(contentReports)
    .where(
      and(
        eq(contentReports.reporterUserId, reporterUserId),
        eq(contentReports.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return report ?? null;
}

export async function insertContentReport(db: Database, value: typeof contentReports.$inferInsert) {
  const [report] = await db.insert(contentReports).values(value).returning();
  return report!;
}
