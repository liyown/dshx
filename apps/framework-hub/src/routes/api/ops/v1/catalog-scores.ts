import { createFileRoute } from "@tanstack/react-router";

import { v1PluginOperations } from "@/lib/api/operations/v1-plugins";
import { refreshInstallReadiness } from "@/lib/catalog/install-readiness.server";
import { refreshPluginScores } from "@/lib/catalog/scores.server";

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
      POST: v1PluginOperations.refreshCatalogScores.route(async ({ db }) => {
        // Readiness feeds the quality score, so it is recomputed first.
        await refreshInstallReadiness(db);
        await refreshPluginScores(db);
        return { refreshed: "all" };
      }),
    },
  },
});
