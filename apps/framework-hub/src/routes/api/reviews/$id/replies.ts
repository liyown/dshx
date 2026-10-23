import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute, withMeta } from "@/lib/api/route";
import { replyCreateSchema, reviewReplySchema } from "@/lib/catalog/contracts";
import { createReviewReply } from "@/lib/community/review-replies.application.server";

export const Route = createFileRoute("/api/reviews/$id/replies")({
  server: {
    handlers: {
      POST: sessionRoute(
        { body: replyCreateSchema, community: "reply", response: reviewReplySchema },
        async ({ db, session, params, input }) => {
          // Repeating an idempotent reply returns the existing one, so only a new reply is a creation.
          const result = await createReviewReply(db, {
            ...input,
            reviewId: params.id,
            userId: session.user.id,
          });
          return withMeta(result.reply, { status: result.created ? 201 : 200 });
        },
      ),
    },
  },
});
