import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { communityDeleteSchema, reviewUpsertSchema } from "@/lib/catalog/contracts";
import { sanitizeUserText } from "@/lib/community/contracts";
import { refreshReviewMetrics } from "@/lib/community/metrics.server";
import {
  requireReviewablePlugin,
  softDeletePluginReview,
  upsertPluginReview,
} from "@/lib/community/reviews.server";
import { uuid } from "@/lib/http";

export const Route = createFileRoute("/api/plugins/$slug/review")({
  server: {
    handlers: {
      PUT: sessionRoute(
        { body: reviewUpsertSchema, community: "review" },
        async ({ db, session, params, input }) => {
          const plugin = await requireReviewablePlugin(db, params.slug, session.user.id);
          const review = await upsertPluginReview(db, {
            id: uuid(),
            pluginId: plugin.id,
            userId: session.user.id,
            rating: input.rating,
            locale: input.locale,
            body: sanitizeUserText(input.body),
            idempotencyKey: input.idempotencyKey,
          });
          await refreshReviewMetrics(db, plugin.id);
          return review;
        },
      ),
      DELETE: sessionRoute(
        { body: communityDeleteSchema, community: "review-delete" },
        async ({ db, session, params }) => {
          const plugin = await requireReviewablePlugin(db, params.slug, session.user.id);
          const review = await softDeletePluginReview(db, plugin.id, session.user.id);
          await refreshReviewMetrics(db, plugin.id);
          return review;
        },
      ),
    },
  },
});
