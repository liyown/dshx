import { createFileRoute } from "@tanstack/react-router";

import { v1PluginOperations } from "@/lib/api/operations/v1-plugins";
import { upsertObservationBatch } from "@/lib/catalog/operations";
import { operationRequestId } from "@/lib/catalog/operations-v1.http";

export const Route = createFileRoute("/api/ops/v1/observations:batch")({
  server: {
    handlers: {
      POST: v1PluginOperations.upsertObservationBatch.route(({ request, db, token, input }) =>
        upsertObservationBatch(
          db,
          token.id,
          operationRequestId(request),
          input.observations,
          input.dryRun,
        ),
      ),
    },
  },
});
