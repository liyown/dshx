import { createFileRoute } from "@tanstack/react-router";

import { v1ContentOperations } from "@/lib/api/operations/v1-content";
import { writeFeaturedPicks } from "@/lib/featured.application.server";

export const Route = createFileRoute("/api/ops/v1/featured/$category")({
  server: {
    handlers: {
      PUT: v1ContentOperations.replaceFeaturedShelf.route(({ db, params, input }) =>
        writeFeaturedPicks(db, params.category, input.pluginSlugs),
      ),
    },
  },
});
