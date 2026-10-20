import { createFileRoute } from "@tanstack/react-router";

import {
  operationFailure,
  operationRequestId,
  operationSuccess,
} from "@/lib/catalog/operations-v1.http";
import { requireDatabase } from "@/lib/db/client";
import { replaceFeaturedForOperations } from "@/lib/featured-operations.server";

export const Route = createFileRoute("/api/ops/v1/featured/$category")({
  server: {
    handlers: {
      PUT: async ({ request, context, params }) => {
        const requestId = operationRequestId(request);
        try {
          const result = await replaceFeaturedForOperations(
            requireDatabase(context),
            request,
            params.category,
          );
          const response = operationSuccess(request, result, { requestId, status: 200 });
          response.headers.set("cache-control", "no-store");
          return response;
        } catch (error) {
          return operationFailure(request, error, requestId);
        }
      },
    },
  },
});
