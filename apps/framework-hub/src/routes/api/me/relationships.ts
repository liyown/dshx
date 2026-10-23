import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { relationshipsSchema } from "@/lib/community/contracts";
import { listRelationships } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/relationships")({
  server: {
    handlers: {
      GET: sessionRoute({ response: relationshipsSchema }, ({ db, session }) =>
        listRelationships(db, session.user.id),
      ),
    },
  },
});
