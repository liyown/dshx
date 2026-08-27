import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { observationBatchSchema } from "@/lib/catalog/operations-v1.contracts";
import {
  operationFailure,
  operationRequestId,
  operationSuccess,
  readOperationJson,
} from "@/lib/catalog/operations-v1.http";
import { upsertObservationBatch } from "@/lib/catalog/operations-v1.server";
import { requireD1, requireDatabase } from "@/lib/db/client";

export const Route = createFileRoute("/api/ops/v1/observations:batch")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const requestId = operationRequestId(request);
        try {
          const actor = await requireApiToken(requireDatabase(context), request, "catalog:write");
          const input = await readOperationJson(request, observationBatchSchema);
          return operationSuccess(
            request,
            await upsertObservationBatch(
              requireD1(context),
              actor.token.id,
              requestId,
              input.observations,
              input.dryRun,
            ),
            { requestId },
          );
        } catch (error) {
          return operationFailure(request, error, requestId);
        }
      },
    },
  },
});
