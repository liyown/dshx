import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { publicRoute } from "@/lib/api/route";
import { pluginReviewPageSchema } from "@/lib/catalog/contracts";
import { listPluginReviews } from "@/lib/community/review-replies.application.server";

const reviewsQuery = z.object({
  cursor: z.coerce
    .number()
    .int()
    .finite()
    .default(() => Date.now() + 1),
  limit: z.coerce
    .number()
    .int()
    .finite()
    .default(20)
    .transform((value) => Math.min(Math.max(value, 1), 50)),
});

export const Route = createFileRoute("/api/plugins/$slug/reviews")({
  server: {
    handlers: {
      GET: publicRoute(
        { querySchema: reviewsQuery, response: pluginReviewPageSchema },
        ({ db, params, query }) =>
          listPluginReviews(db, { slug: params.slug, cursor: query.cursor, limit: query.limit }),
      ),
    },
  },
});
