import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { operationReportInputSchema } from "@/lib/catalog/operations-v1.contracts";
import {
  operationFailure,
  operationSuccess,
  readOperationJson,
} from "@/lib/catalog/operations-v1.http";
import {
  latestOperationReport,
  publishOperationReport,
} from "@/lib/catalog/operation-reports.server";
import { requireDatabase } from "@/lib/db/client";

export const Route = createFileRoute("/api/ops/v1/reports/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          await requireApiToken(requireDatabase(context), request, "catalog:write");
          return operationSuccess(request, await latestOperationReport(requireDatabase(context)));
        } catch (error) {
          return operationFailure(request, error);
        }
      },
      POST: async ({ request, context }) => {
        try {
          const actor = await requireApiToken(requireDatabase(context), request, "catalog:write");
          const input = await readOperationJson(request, operationReportInputSchema);
          const result = await publishOperationReport(
            requireDatabase(context),
            actor.token.id,
            input,
          );
          return operationSuccess(request, result, {
            status: result.status === "created" ? 201 : 200,
          });
        } catch (error) {
          return operationFailure(request, error);
        }
      },
    },
  },
});
