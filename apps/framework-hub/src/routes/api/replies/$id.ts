import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { communityDeleteSchema, replyCreateSchema } from "@/lib/catalog/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import {
  editReviewReply,
  removeReviewReply,
} from "@/lib/community/review-replies.application.server";
import { jsonError, readJson } from "@/lib/http";

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
          const reply = await editReviewReply(db, {
            ...input,
            replyId: params.id,
            userId: session.user.id,
          });
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
          const reply = await removeReviewReply(db, params.id, session.user.id);
          return Response.json(reply);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
