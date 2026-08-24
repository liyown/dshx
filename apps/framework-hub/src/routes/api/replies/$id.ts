import { and, eq } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { communityDeleteSchema, replyCreateSchema } from "@/lib/catalog/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { sanitizeUserText } from "@/lib/community/contracts";
import { reviewReplies } from "@/lib/db/schema";
import { HttpError, jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/replies/$id")({
  server: {
    handlers: {
      PUT: async ({ request, context, params }) => {
        try {
          const { session, db } = await requireSession(request, context);
          const input = await readJson(request, replyCreateSchema);
          await requireCommunityWrite(
            request,
            context,
            db,
            session.user.id,
            "reply-edit",
            input.turnstileToken,
          );
          const [reply] = await db
            .update(reviewReplies)
            .set({
              body: sanitizeUserText(input.body)!,
              locale: input.locale,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(reviewReplies.id, params.id),
                eq(reviewReplies.userId, session.user.id),
                eq(reviewReplies.status, "published"),
              ),
            )
            .returning();
          if (!reply) throw new HttpError(404, "Reply not found", "reply_not_found");
          return Response.json(reply);
        } catch (error) {
          return jsonError(error);
        }
      },
      DELETE: async ({ request, context, params }) => {
        try {
          const { session, db } = await requireSession(request, context);
          const input = await readJson(request, communityDeleteSchema);
          await requireCommunityWrite(
            request,
            context,
            db,
            session.user.id,
            "reply-delete",
            input.turnstileToken,
          );
          const [reply] = await db
            .update(reviewReplies)
            .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(reviewReplies.id, params.id), eq(reviewReplies.userId, session.user.id)))
            .returning();
          if (!reply) throw new HttpError(404, "Reply not found", "reply_not_found");
          return Response.json(reply);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
