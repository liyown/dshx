import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { relationshipWriteSchema } from "@/lib/community/contracts";
import { setUserBlock } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/blocks/$userId")({
  server: {
    handlers: {
      PUT: sessionRoute(
        { body: relationshipWriteSchema, community: "user.block" },
        ({ db, session, params }) => setUserBlock(db, session.user.id, params.userId, true),
      ),
      DELETE: sessionRoute(
        { body: relationshipWriteSchema, community: "user.block" },
        ({ db, session, params }) => setUserBlock(db, session.user.id, params.userId, false),
      ),
    },
  },
});
