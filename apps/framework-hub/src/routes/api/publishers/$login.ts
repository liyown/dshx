import { createFileRoute } from "@tanstack/react-router";

import { localeQuery, publicRoute } from "@/lib/api/route";
import { getPublicPublisher } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/publishers/$login")({
  server: {
    handlers: {
      GET: publicRoute({ ...localeQuery }, ({ db, params, query }) =>
        getPublicPublisher(db, params.login, query.locale),
      ),
    },
  },
});
