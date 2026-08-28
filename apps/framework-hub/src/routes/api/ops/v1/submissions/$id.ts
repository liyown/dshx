import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { operationFailure, operationSuccess } from "@/lib/catalog/operations-v1.http";
import { getOpsSubmission } from "@/lib/catalog/operations-v1.server";
import { requireDatabase } from "@/lib/db/client";

export const Route = createFileRoute("/api/ops/v1/submissions/$id")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          await requireApiToken(requireDatabase(context), request, "catalog:write");
          return operationSuccess(
            request,
            await getOpsSubmission(requireDatabase(context), params.id),
          );
        } catch (error) {
          return operationFailure(request, error);
        }
      },
    },
  },
});
