import { createFileRoute } from "@tanstack/react-router";

import { catalogOperations } from "@/lib/api/operations/catalog";
import { listPluginReviews } from "@/lib/community/review-replies.application.server";

export const Route = createFileRoute("/api/plugins/$slug/reviews")({
  server: {
    handlers: {
      GET: catalogOperations.listPluginReviews.route(({ db, params, query }) =>
        listPluginReviews(db, { slug: params.slug, cursor: query.cursor, limit: query.limit }),
      ),
    },
  },
});
