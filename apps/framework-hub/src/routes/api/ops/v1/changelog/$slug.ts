import { createFileRoute } from "@tanstack/react-router";
import { requireDatabase } from "@/lib/db/client";
import {
  operationFailure,
  operationRequestId,
  operationSuccess,
} from "@/lib/catalog/operations-v1.http";
import {
  getChangelogForOperations,
  updateChangelogForOperations,
} from "@/lib/changelog-operations.server";

export const Route = createFileRoute("/api/ops/v1/changelog/$slug")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        const requestId = operationRequestId(request);
        try {
          const result = await getChangelogForOperations(
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
      PUT: async ({ request, context, params }) => {
        const requestId = operationRequestId(request);
        try {
          const result = await updateChangelogForOperations(
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
