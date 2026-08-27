import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { pluginCurationRequestSchema } from "@/lib/catalog/operations-v1.contracts";
import {
  operationFailure,
  operationRequestId,
  operationSuccess,
  readOperationJson,
} from "@/lib/catalog/operations-v1.http";
import { curatePlugin } from "@/lib/catalog/operations-v1.server";
import { requireD1, requireDatabase } from "@/lib/db/client";

export const Route = createFileRoute("/api/ops/v1/plugins/$id/curation")({
  server: {
    handlers: {
      PATCH: async ({ request, context, params }) => {
        const requestId = operationRequestId(request);
        try {
          const actor = await requireApiToken(requireDatabase(context), request, "catalog:write");
          const input = await readOperationJson(request, pluginCurationRequestSchema);
          return operationSuccess(
            request,
            await curatePlugin(
              requireD1(context),
              actor.token.id,
              requestId,
              params.id,
              input.content,
              input.ifRevision,
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
