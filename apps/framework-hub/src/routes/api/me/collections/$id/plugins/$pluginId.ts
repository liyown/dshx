import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { collectionDetailSchema, relationshipWriteSchema } from "@/lib/community/contracts";
import { setCollectionPlugin } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/collections/$id/plugins/$pluginId")({
  server: {
    handlers: {
      PUT: sessionRoute(
        {
          body: relationshipWriteSchema,
          community: "collection.plugin",
          response: collectionDetailSchema,
        },
        ({ db, session, params }) =>
          setCollectionPlugin(db, params.id, params.pluginId, session.user.id, true),
      ),
      DELETE: sessionRoute(
        {
          body: relationshipWriteSchema,
          community: "collection.plugin",
          response: collectionDetailSchema,
        },
        ({ db, session, params }) =>
          setCollectionPlugin(db, params.id, params.pluginId, session.user.id, false),
      ),
    },
  },
});
