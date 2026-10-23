import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { collectionCreateSchema } from "@/lib/community/contracts";
import { createCollection, listCollections } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/collections/")({
  server: {
    handlers: {
      GET: sessionRoute({}, ({ db, session }) => listCollections(db, session.user.id)),
      POST: sessionRoute(
        { body: collectionCreateSchema, community: "collection.create", status: 201 },
        ({ db, session, input }) => createCollection(db, session.user.id, input),
      ),
    },
  },
});
