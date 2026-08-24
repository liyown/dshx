import { and, eq, or } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { replyCreateSchema } from "@/lib/catalog/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { sanitizeUserText } from "@/lib/community/contracts";
import { pluginReviews, reviewReplies, userBlocks } from "@/lib/db/schema";
import { HttpError, jsonError, readJson, uuid } from "@/lib/http";

export const Route = createFileRoute("/api/reviews/$id/replies")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          const { session, db } = await requireSession(request, context);
          const input = await readJson(request, replyCreateSchema);
          await requireCommunityWrite(
            request,
            context,
            db,
            session.user.id,
            "reply",
            input.turnstileToken,
          );
          const [review] = await db
            .select()
            .from(pluginReviews)
            .where(eq(pluginReviews.id, params.id))
            .limit(1);
          if (!review || review.status !== "published")
            throw new HttpError(404, "Review not found", "review_not_found");
          const [blocked] = await db
            .select()
            .from(userBlocks)
            .where(
              or(
                and(
                  eq(userBlocks.blockerUserId, session.user.id),
                  eq(userBlocks.blockedUserId, review.userId),
                ),
                and(
                  eq(userBlocks.blockerUserId, review.userId),
                  eq(userBlocks.blockedUserId, session.user.id),
                ),
              ),
            )
            .limit(1);
          if (blocked) throw new HttpError(403, "This interaction is blocked", "user_blocked");
          const [existing] = await db
            .select()
            .from(reviewReplies)
            .where(eq(reviewReplies.idempotencyKey, input.idempotencyKey))
            .limit(1);
          if (existing?.userId === session.user.id) return Response.json(existing);
          const [reply] = await db
            .insert(reviewReplies)
            .values({
              id: uuid(),
              reviewId: review.id,
              userId: session.user.id,
              locale: input.locale,
              body: sanitizeUserText(input.body)!,
              idempotencyKey: input.idempotencyKey,
            })
            .returning();
          return Response.json(reply, { status: 201 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
