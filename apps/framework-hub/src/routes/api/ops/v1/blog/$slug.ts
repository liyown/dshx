import { createFileRoute } from "@tanstack/react-router";

import { getBlogForOperations, updateBlogForOperations } from "@/lib/blog-operations.server";
import {
  operationFailure,
  operationRequestId,
  operationSuccess,
} from "@/lib/catalog/operations-v1.http";
import { requireDatabase } from "@/lib/db/client";

export const Route = createFileRoute("/api/ops/v1/blog/$slug")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        const requestId = operationRequestId(request);
        try {
          const result = await getBlogForOperations(requireDatabase(context), request, params.slug);
          const response = operationSuccess(request, result, { requestId, status: 200 });
          response.headers.set("cache-control", "no-store");
          return response;
        } catch (error) {
          return operationFailure(request, error, requestId);
        }
      },
      PUT: async ({ request, context, params }) => {
        const requestId = operationRequestId(request);
        try {
          const result = await updateBlogForOperations(
            requireDatabase(context),
            request,
            params.slug,
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
