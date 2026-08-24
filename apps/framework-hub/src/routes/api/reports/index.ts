import { and, eq } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { reportCreateSchema } from "@/lib/catalog/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { sanitizeUserText } from "@/lib/community/contracts";
import { requireD1 } from "@/lib/db/client";
import { contentReports } from "@/lib/db/schema";
import { HttpError, jsonError, readJson, uuid } from "@/lib/http";

export const Route = createFileRoute("/api/reports/")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const { session, db } = await requireSession(request, context);
          const input = await readJson(request, reportCreateSchema);
          await requireCommunityWrite(
            request,
            context,
            db,
            session.user.id,
            "report",
            input.turnstileToken,
          );
          const [existing] = await db
            .select()
            .from(contentReports)
            .where(
              and(
                eq(contentReports.reporterUserId, session.user.id),
                eq(contentReports.idempotencyKey, input.idempotencyKey),
              ),
            )
            .limit(1);
          if (existing) return Response.json(existing);
          const table = {
            plugin: "plugins",
            review: "plugin_reviews",
            reply: "review_replies",
            profile: "user_profiles",
            collection: "collections",
          }[input.targetType];
          const column = input.targetType === "profile" ? "user_id" : "id";
          const target = await requireD1(context)
            .prepare(`select ${column} id from ${table} where ${column}=? limit 1`)
            .bind(input.targetId)
            .first();
          if (!target) throw new HttpError(404, "Report target does not exist", "target_not_found");
          const [report] = await db
            .insert(contentReports)
            .values({
              id: uuid(),
              reporterUserId: session.user.id,
              targetType: input.targetType,
              targetId: input.targetId,
              reason: input.reason,
              details: sanitizeUserText(input.details),
              idempotencyKey: input.idempotencyKey,
            })
            .returning();
          return Response.json(report, { status: 201 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
