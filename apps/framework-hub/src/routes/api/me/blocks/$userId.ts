import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { relationshipWriteSchema, userBlockResultSchema } from "@/lib/community/contracts";
import { setUserBlock } from "@/lib/community/membership.server";

export const Route = createFileRoute("/api/me/blocks/$userId")({
  server: {
    handlers: {
      PUT: sessionRoute(
        { body: relationshipWriteSchema, community: "user.block", response: userBlockResultSchema },
        ({ db, session, params }) => setUserBlock(db, session.user.id, params.userId, true),
      ),
      DELETE: sessionRoute(
        { body: relationshipWriteSchema, community: "user.block", response: userBlockResultSchema },
        ({ db, session, params }) => setUserBlock(db, session.user.id, params.userId, false),
      ),
    },
  },
});
