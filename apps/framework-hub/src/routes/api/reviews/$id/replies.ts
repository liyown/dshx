import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { replyCreateSchema } from "@/lib/catalog/contracts";
import { createReviewReply } from "@/lib/community/review-replies.application.server";

export const Route = createFileRoute("/api/reviews/$id/replies")({
  server: {
    handlers: {
      POST: sessionRoute(
        { body: replyCreateSchema, community: "reply" },
        async ({ db, session, params, input }) => {
          // Repeating an idempotent reply returns the existing one, so only a new reply is a creation.
          const result = await createReviewReply(db, {
            ...input,
            reviewId: params.id,
            userId: session.user.id,
          });
          return Response.json(result.reply, { status: result.created ? 201 : 200 });
        },
      ),
    },
  },
});
