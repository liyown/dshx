import { createFileRoute } from "@tanstack/react-router";
import {
  operationDryRunQuerySchema,
  pluginObservationV1Schema,
} from "@becomeopc/dshx-hub-contracts";

import { tokenRoute, withMeta } from "@/lib/api/route";
import { upsertObservation } from "@/lib/catalog/operations";
import {
  OperationHttpError,
  operationRequestId,
  parseOperationInput,
} from "@/lib/catalog/operations-v1.http";

export const Route = createFileRoute("/api/ops/v1/observations/$observationId")({
  server: {
    handlers: {
      PUT: tokenRoute(
        { envelope: "operation", body: pluginObservationV1Schema },
        async ({ request, db, token, params, input }) => {
          if (params.observationId !== input.observationId)
            throw new OperationHttpError(
              422,
              "observation_id_mismatch",
              "Path observation id does not match the request body",
              false,
              { path: "observationId" },
            );
          const dryRun = readDryRun(request);
          const data = await upsertObservation(
            db,
            token.id,
            operationRequestId(request),
            input,
            dryRun,
          );
          return withMeta(data, { status: !dryRun && data.status === "created" ? 201 : 200 });
        },
      ),
    },
  },
});

function readDryRun(request: Request): boolean {
  const values = new URL(request.url).searchParams.getAll("dryRun");
  if (values.length > 1)
    throw new OperationHttpError(
      422,
      "invalid_body",
      "dryRun may be provided at most once",
      false,
      { path: "dryRun" },
    );
  return values.length === 1
    ? parseOperationInput(operationDryRunQuerySchema, values[0]) === "true"
    : false;
}
