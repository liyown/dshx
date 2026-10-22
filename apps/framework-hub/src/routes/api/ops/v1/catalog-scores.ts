import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { refreshInstallReadiness } from "@/lib/catalog/install-readiness.server";
import { operationFailure, operationSuccess } from "@/lib/catalog/operations-v1.http";
import { refreshPluginScores } from "@/lib/catalog/scores.server";
import { requireDatabase } from "@/lib/db/client";

/**
 * Recomputes the catalog ranking signals and install readiness for every
 * published plugin. The catalog refreshes a plugin's projections whenever an
 * observation, curation, media upload, review, bookmark, follow, or approval
 * effect changes its facts; this endpoint repairs them after an out-of-band
 * D1 edit and is safe to call at any time. Running it right after a deploy
 * also warms the readiness rows before the first marketplace request.
 */
export const Route = createFileRoute("/api/ops/v1/catalog-scores")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          // Readiness feeds the quality score, so it is recomputed first.
          await refreshInstallReadiness(db);
          await refreshPluginScores(db);
          return operationSuccess(request, { refreshed: "all" });
        } catch (error) {
          return operationFailure(request, error);
        }
      },
    },
  },
});
