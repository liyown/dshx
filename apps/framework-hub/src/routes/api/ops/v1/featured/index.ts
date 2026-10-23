import { createFileRoute } from "@tanstack/react-router";

import { v1ContentOperations } from "@/lib/api/operations/v1-content";
import { readFeaturedPicks } from "@/lib/featured.application.server";

export const Route = createFileRoute("/api/ops/v1/featured/")({
  server: {
    handlers: {
      GET: v1ContentOperations.listFeaturedShelves.route(({ db }) => readFeaturedPicks(db)),
    },
  },
});
