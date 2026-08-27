import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { pluginVisibilityRequestSchema } from "@/lib/catalog/operations-v1.contracts";
import {
  operationFailure,
  operationRequestId,
  operationSuccess,
  readOperationJson,
} from "@/lib/catalog/operations-v1.http";
import { setPluginVisibility } from "@/lib/catalog/operations-v1.server";
import { requireD1, requireDatabase } from "@/lib/db/client";

export const Route = createFileRoute("/api/ops/v1/plugins/$id/visibility")({
  server: {
    handlers: {
      PUT: async ({ request, context, params }) => {
        const requestId = operationRequestId(request);
        try {
          const actor = await requireApiToken(requireDatabase(context), request, "catalog:write");
          const input = await readOperationJson(request, pluginVisibilityRequestSchema);
          return operationSuccess(
            request,
            await setPluginVisibility(
              requireD1(context),
              actor.token.id,
              requestId,
              params.id,
              input.visibility,
              input.reason,
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
