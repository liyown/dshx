import { createFileRoute } from "@tanstack/react-router";

import { publicRoute } from "@/lib/api/route";
import { getCollection } from "@/lib/community/collections.server";

export const Route = createFileRoute("/api/collections/$id")({
  server: {
    handlers: {
      GET: publicRoute({}, ({ db, params }) => getCollection(db, params.id)),
    },
  },
});
