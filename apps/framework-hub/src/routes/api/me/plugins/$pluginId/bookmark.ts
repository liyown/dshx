import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { relationshipWriteSchema } from "@/lib/community/contracts";
import { setPluginRelationship } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/plugins/$pluginId/bookmark")({
  server: {
    handlers: {
      PUT: sessionRoute(
        { body: relationshipWriteSchema, community: "bookmark" },
        ({ db, session, params }) =>
          setPluginRelationship(db, session.user.id, params.pluginId, "bookmark", true),
      ),
      DELETE: sessionRoute(
        { body: relationshipWriteSchema, community: "bookmark" },
        ({ db, session, params }) =>
          setPluginRelationship(db, session.user.id, params.pluginId, "bookmark", false),
      ),
    },
  },
});
