import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { collectionUpdateSchema, relationshipWriteSchema } from "@/lib/community/contracts";
import {
  deleteCollection,
  getCollection,
  updateCollection,
} from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/collections/$id")({
  server: {
    handlers: {
      GET: sessionRoute({}, ({ db, session, params }) =>
        getCollection(db, params.id, session.user.id),
      ),
      PATCH: sessionRoute(
        { body: collectionUpdateSchema, community: "collection.update" },
        ({ db, session, params, input }) => updateCollection(db, params.id, session.user.id, input),
      ),
      DELETE: sessionRoute(
        { body: relationshipWriteSchema, community: "collection.delete" },
        ({ db, session, params }) => deleteCollection(db, params.id, session.user.id),
      ),
    },
  },
});
