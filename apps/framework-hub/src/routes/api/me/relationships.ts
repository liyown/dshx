import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { listRelationships } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/relationships")({
  server: {
    handlers: {
      GET: sessionRoute({}, ({ db, session }) => listRelationships(db, session.user.id)),
    },
  },
});
