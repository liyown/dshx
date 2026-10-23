import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { publisherFollowResultSchema, relationshipWriteSchema } from "@/lib/community/contracts";
import { setPublisherFollow } from "@/lib/community/membership.server";

export const Route = createFileRoute("/api/me/publishers/$publisherId/follow")({
  server: {
    handlers: {
      PUT: sessionRoute(
        {
          body: relationshipWriteSchema,
          community: "publisher.follow",
          response: publisherFollowResultSchema,
        },
        ({ db, session, params }) =>
          setPublisherFollow(db, session.user.id, params.publisherId, true),
      ),
      DELETE: sessionRoute(
        {
          body: relationshipWriteSchema,
          community: "publisher.follow",
          response: publisherFollowResultSchema,
        },
        ({ db, session, params }) =>
          setPublisherFollow(db, session.user.id, params.publisherId, false),
      ),
    },
  },
});
