import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { operationFailure, operationSuccess } from "@/lib/catalog/operations-v1.http";
import { refreshPluginScores } from "@/lib/catalog/scores.server";
import { requireDatabase } from "@/lib/db/client";

/**
 * Recomputes the catalog ranking signals for every published plugin. The
 * catalog refreshes a plugin's scores whenever an observation, media upload,
 * review, bookmark, follow, or approval effect changes its facts; this
 * endpoint repairs scores after an out-of-band D1 edit and is safe to call at
 * any time.
 */
export const Route = createFileRoute("/api/ops/v1/catalog-scores")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          await refreshPluginScores(db);
          return operationSuccess(request, { refreshed: "all" });
        } catch (error) {
          return operationFailure(request, error);
        }
      },
    },
  },
});
