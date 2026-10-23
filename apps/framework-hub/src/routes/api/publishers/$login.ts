import { createFileRoute } from "@tanstack/react-router";

import { catalogOperations } from "@/lib/api/operations/catalog";
import { getPublicPublisher } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/publishers/$login")({
  server: {
    handlers: {
      GET: catalogOperations.getPublisher.route(({ db, params, query }) =>
        getPublicPublisher(db, params.login, query.locale),
      ),
    },
  },
});
