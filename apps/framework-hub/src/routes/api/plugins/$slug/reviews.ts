import { createFileRoute } from "@tanstack/react-router";

import { listPluginReviews } from "@/lib/community/review-replies.application.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/plugins/$slug/reviews")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          const url = new URL(request.url);
          const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 50);
          const cursor = Number(url.searchParams.get("cursor") ?? Date.now() + 1);
          return Response.json(await listPluginReviews(db, { slug: params.slug, cursor, limit }));
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
