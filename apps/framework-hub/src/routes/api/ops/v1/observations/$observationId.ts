import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import {
  operationDryRunQuerySchema,
  pluginObservationV1Schema,
} from "@/lib/catalog/operations-v1.contracts";
import {
  OperationHttpError,
  operationFailure,
  operationRequestId,
  operationSuccess,
  parseOperationInput,
  readOperationJson,
} from "@/lib/catalog/operations-v1.http";
import { upsertObservation } from "@/lib/catalog/operations-v1.server";
import { requireDatabase } from "@/lib/db/client";

export const Route = createFileRoute("/api/ops/v1/observations/$observationId")({
  server: {
    handlers: {
      PUT: async ({ request, context, params }) => {
        const requestId = operationRequestId(request);
        try {
          const actor = await requireApiToken(requireDatabase(context), request, "catalog:write");
          const observation = await readOperationJson(request, pluginObservationV1Schema);
          if (params.observationId !== observation.observationId)
            throw new OperationHttpError(
              422,
              "observation_id_mismatch",
              "Path observation id does not match the request body",
              false,
              { path: "observationId" },
            );
          const dryRunValues = new URL(request.url).searchParams.getAll("dryRun");
          if (dryRunValues.length > 1)
            throw new OperationHttpError(
              422,
              "invalid_body",
              "dryRun may be provided at most once",
              false,
              { path: "dryRun" },
            );
          const rawDryRun = dryRunValues[0];
          const dryRun = rawDryRun
            ? parseOperationInput(operationDryRunQuerySchema, rawDryRun) === "true"
            : false;
          const data = await upsertObservation(
            requireDatabase(context),
            actor.token.id,
            requestId,
            observation,
            dryRun,
          );
          return operationSuccess(request, data, {
            status: !dryRun && data.status === "created" ? 201 : 200,
            requestId,
          });
        } catch (error) {
          return operationFailure(request, error, requestId);
        }
      },
    },
  },
});
