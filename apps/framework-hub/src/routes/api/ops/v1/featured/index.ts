import { createFileRoute } from "@tanstack/react-router";

import {
  operationFailure,
  operationRequestId,
  operationSuccess,
} from "@/lib/catalog/operations-v1.http";
import { requireDatabase } from "@/lib/db/client";
import { readFeaturedForOperations } from "@/lib/featured-operations.server";

export const Route = createFileRoute("/api/ops/v1/featured/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const requestId = operationRequestId(request);
        try {
          const result = await readFeaturedForOperations(requireDatabase(context), request);
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
