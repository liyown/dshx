import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import {
  collectionDeletionSchema,
  collectionDetailSchema,
  collectionUpdateSchema,
  relationshipWriteSchema,
} from "@/lib/community/contracts";
import {
  deleteCollection,
  getCollection,
  updateCollection,
} from "@/lib/community/collections.server";

export const Route = createFileRoute("/api/me/collections/$id")({
  server: {
    handlers: {
      GET: sessionRoute({ response: collectionDetailSchema }, ({ db, session, params }) =>
        getCollection(db, params.id, session.user.id),
      ),
      PATCH: sessionRoute(
        {
          body: collectionUpdateSchema,
          community: "collection.update",
          response: collectionDetailSchema,
        },
        ({ db, session, params, input }) => updateCollection(db, params.id, session.user.id, input),
      ),
      DELETE: sessionRoute(
        {
          body: relationshipWriteSchema,
          community: "collection.delete",
          response: collectionDeletionSchema,
        },
        ({ db, session, params }) => deleteCollection(db, params.id, session.user.id),
      ),
    },
  },
});
