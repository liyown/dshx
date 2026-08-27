import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { submissionListQuerySchema } from "@/lib/catalog/operations-v1.contracts";
import {
  operationFailure,
  operationSuccess,
  parseOperationInput,
} from "@/lib/catalog/operations-v1.http";
import { listOpsSubmissions } from "@/lib/catalog/operations-v1.server";
import { requireD1, requireDatabase } from "@/lib/db/client";

function statuses(params: URLSearchParams) {
  const values = [
    ...new Set(
      params
        .getAll("status")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  return values.length ? values : undefined;
}

export const Route = createFileRoute("/api/ops/v1/submissions/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          await requireApiToken(requireDatabase(context), request, "catalog:write");
          const params = new URL(request.url).searchParams;
          const query = parseOperationInput(submissionListQuerySchema, {
            status: statuses(params),
            limit: params.has("limit") ? Number(params.get("limit")) : undefined,
            cursor: params.get("cursor") ?? undefined,
          });
          return operationSuccess(request, await listOpsSubmissions(requireD1(context), query));
        } catch (error) {
          return operationFailure(request, error);
        }
      },
    },
  },
});
