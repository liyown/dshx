import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { communityDeleteSchema, replyCreateSchema } from "@/lib/catalog/contracts";
import {
  editReviewReply,
  removeReviewReply,
} from "@/lib/community/review-replies.application.server";

export const Route = createFileRoute("/api/replies/$id")({
  server: {
    handlers: {
      PUT: sessionRoute(
        { body: replyCreateSchema, community: "reply-edit" },
        ({ db, session, params, input }) =>
          editReviewReply(db, { ...input, replyId: params.id, userId: session.user.id }),
      ),
      DELETE: sessionRoute(
        { body: communityDeleteSchema, community: "reply-delete" },
        ({ db, session, params }) => removeReviewReply(db, params.id, session.user.id),
      ),
    },
  },
});
