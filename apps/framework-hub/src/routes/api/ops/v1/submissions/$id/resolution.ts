import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { submissionResolutionSchema } from "@/lib/catalog/operations-v1.contracts";
import {
  operationFailure,
  operationRequestId,
  operationSuccess,
  readOperationJson,
} from "@/lib/catalog/operations-v1.http";
import { resolveOpsSubmission } from "@/lib/catalog/operations-v1.server";
import { requireD1, requireDatabase } from "@/lib/db/client";

export const Route = createFileRoute("/api/ops/v1/submissions/$id/resolution")({
  server: {
    handlers: {
      PUT: async ({ request, context, params }) => {
        const requestId = operationRequestId(request);
        try {
          const actor = await requireApiToken(requireDatabase(context), request, "catalog:write");
          const input = await readOperationJson(request, submissionResolutionSchema);
          return operationSuccess(
            request,
            await resolveOpsSubmission(
              requireD1(context),
              actor.token.id,
              requestId,
              params.id,
              input,
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
