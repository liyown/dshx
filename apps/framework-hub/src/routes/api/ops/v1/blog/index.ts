import { createFileRoute } from "@tanstack/react-router";

import { createBlogForOperations, listBlogForOperations } from "@/lib/blog-operations.server";
import {
  operationFailure,
  operationRequestId,
  operationSuccess,
} from "@/lib/catalog/operations-v1.http";
import { requireDatabase } from "@/lib/db/client";

export const Route = createFileRoute("/api/ops/v1/blog/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const requestId = operationRequestId(request);
        try {
          const result = await listBlogForOperations(requireDatabase(context), request);
          const response = operationSuccess(request, result, { requestId, status: 200 });
          response.headers.set("cache-control", "no-store");
          return response;
        } catch (error) {
          return operationFailure(request, error, requestId);
        }
      },
      POST: async ({ request, context }) => {
        const requestId = operationRequestId(request);
        try {
          const result = await createBlogForOperations(requireDatabase(context), request);
          const response = operationSuccess(request, result, { requestId, status: 201 });
          response.headers.set("cache-control", "no-store");
          return response;
        } catch (error) {
          return operationFailure(request, error, requestId);
        }
      },
    },
  },
});
