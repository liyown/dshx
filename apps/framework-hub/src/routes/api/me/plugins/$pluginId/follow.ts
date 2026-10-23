import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { pluginRelationshipResultSchema, relationshipWriteSchema } from "@/lib/community/contracts";
import { setPluginRelationship } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/plugins/$pluginId/follow")({
  server: {
    handlers: {
      PUT: sessionRoute(
        {
          body: relationshipWriteSchema,
          community: "plugin.follow",
          response: pluginRelationshipResultSchema,
        },
        ({ db, session, params }) =>
          setPluginRelationship(db, session.user.id, params.pluginId, "follow", true),
      ),
      DELETE: sessionRoute(
        {
          body: relationshipWriteSchema,
          community: "plugin.follow",
          response: pluginRelationshipResultSchema,
        },
        ({ db, session, params }) =>
          setPluginRelationship(db, session.user.id, params.pluginId, "follow", false),
      ),
    },
  },
});
