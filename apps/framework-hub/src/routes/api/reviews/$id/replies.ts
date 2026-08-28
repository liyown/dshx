import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { replyCreateSchema } from "@/lib/catalog/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { createReviewReply } from "@/lib/community/review-replies.application.server";
import { jsonError, readJson } from "@/lib/http";

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
          const result = await createReviewReply(db, {
            ...input,
            reviewId: params.id,
            userId: session.user.id,
          });
          return Response.json(result.reply, { status: result.created ? 201 : 200 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
