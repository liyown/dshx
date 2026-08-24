import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { communityDeleteSchema, reviewUpsertSchema } from "@/lib/catalog/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { sanitizeUserText } from "@/lib/community/contracts";
import { refreshReviewMetrics } from "@/lib/community/metrics.server";
import {
  requireReviewablePlugin,
  softDeletePluginReview,
  upsertPluginReview,
} from "@/lib/community/reviews.server";
import { jsonError, readJson, uuid } from "@/lib/http";

export const Route = createFileRoute("/api/plugins/$slug/review")({
  server: {
    handlers: {
      PUT: async ({ request, context, params }) => {
        try {
          const { session, db } = await requireSession(request, context);
          const input = await readJson(request, reviewUpsertSchema);
          await requireCommunityWrite(
            request,
            context,
            db,
            session.user.id,
            "review",
            input.turnstileToken,
          );
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
          return Response.json(review);
        } catch (error) {
          return jsonError(error);
        }
      },
      DELETE: async ({ request, context, params }) => {
        try {
          const { session, db } = await requireSession(request, context);
          const input = await readJson(request, communityDeleteSchema);
          await requireCommunityWrite(
            request,
            context,
            db,
            session.user.id,
            "review-delete",
            input.turnstileToken,
          );
          const plugin = await requireReviewablePlugin(db, params.slug, session.user.id);
          const review = await softDeletePluginReview(db, plugin.id, session.user.id);
          await refreshReviewMetrics(db, plugin.id);
          return Response.json(review);
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
