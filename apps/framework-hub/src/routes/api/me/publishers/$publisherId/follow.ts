import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { relationshipWriteSchema } from "@/lib/community/contracts";
import { setPublisherFollow } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/publishers/$publisherId/follow")({
  server: {
    handlers: {
      PUT: sessionRoute(
        { body: relationshipWriteSchema, community: "publisher.follow" },
        ({ db, session, params }) =>
          setPublisherFollow(db, session.user.id, params.publisherId, true),
      ),
      DELETE: sessionRoute(
        { body: relationshipWriteSchema, community: "publisher.follow" },
        ({ db, session, params }) =>
          setPublisherFollow(db, session.user.id, params.publisherId, false),
      ),
    },
  },
});
