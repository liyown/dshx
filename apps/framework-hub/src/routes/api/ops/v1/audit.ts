import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { operationAuditQuerySchema } from "@/lib/catalog/operations-v1.contracts";
import {
  operationFailure,
  operationSuccess,
  parseOperationInput,
} from "@/lib/catalog/operations-v1.http";
import { auditOperations } from "@/lib/catalog/operations-v1.server";
import { requireD1, requireDatabase } from "@/lib/db/client";
import { requireBindings } from "@/lib/db/context";

export const Route = createFileRoute("/api/ops/v1/audit")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          await requireApiToken(requireDatabase(context), request, "catalog:write");
          const params = new URL(request.url).searchParams;
          const query = parseOperationInput(operationAuditQuerySchema, {
            scope: params.get("scope") ?? undefined,
          });
          return operationSuccess(
            request,
            await auditOperations(
              requireD1(context),
              requireBindings(context).PLUGIN_MEDIA,
              query.scope,
            ),
          );
        } catch (error) {
          return operationFailure(request, error);
        }
      },
    },
  },
});
