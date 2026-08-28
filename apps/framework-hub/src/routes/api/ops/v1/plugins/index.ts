import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { opsPluginListQuerySchema } from "@/lib/catalog/operations-v1.contracts";
import {
  operationFailure,
  operationSuccess,
  parseOperationInput,
} from "@/lib/catalog/operations-v1.http";
import { listOpsPlugins } from "@/lib/catalog/operations-v1.server";
import { requireDatabase } from "@/lib/db/client";

function values(params: URLSearchParams, name: string) {
  const items = [
    ...new Set(
      params
        .getAll(name)
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  return items.length ? items : undefined;
}

export const Route = createFileRoute("/api/ops/v1/plugins/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          await requireApiToken(requireDatabase(context), request, "catalog:write");
          const params = new URL(request.url).searchParams;
          const query = parseOperationInput(opsPluginListQuerySchema, {
            state: values(params, "state"),
            needs: values(params, "needs"),
            source: values(params, "source"),
            risk: values(params, "risk"),
            observedBefore: params.get("observedBefore") ?? undefined,
            updatedBefore: params.get("updatedBefore") ?? undefined,
            limit: params.has("limit") ? Number(params.get("limit")) : undefined,
            cursor: params.get("cursor") ?? undefined,
          });
          return operationSuccess(request, await listOpsPlugins(requireDatabase(context), query));
        } catch (error) {
          return operationFailure(request, error);
        }
      },
    },
  },
});
