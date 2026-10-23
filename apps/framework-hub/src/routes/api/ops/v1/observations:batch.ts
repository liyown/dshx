import { createFileRoute } from "@tanstack/react-router";
import { observationBatchSchema } from "@becomeopc/dshx-hub-contracts";

import { tokenRoute } from "@/lib/api/route";
import { upsertObservationBatch } from "@/lib/catalog/operations";
import { operationRequestId } from "@/lib/catalog/operations-v1.http";

export const Route = createFileRoute("/api/ops/v1/observations:batch")({
  server: {
    handlers: {
      POST: tokenRoute(
        { envelope: "operation", body: observationBatchSchema },
        ({ request, db, token, input }) =>
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
