import { createFileRoute } from "@tanstack/react-router";
import { requireDatabase } from "@/lib/db/client";
import {
  operationFailure,
  operationRequestId,
  operationSuccess,
} from "@/lib/catalog/operations-v1.http";
import {
  listChangelogForOperations,
  createChangelogForOperations,
} from "@/lib/changelog-operations.server";

export const Route = createFileRoute("/api/ops/v1/changelog/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const requestId = operationRequestId(request);
        try {
          const result = await listChangelogForOperations(requireDatabase(context), request);
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
          const result = await createChangelogForOperations(requireDatabase(context), request);
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
