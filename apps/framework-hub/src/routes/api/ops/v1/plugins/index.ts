import { createFileRoute } from "@tanstack/react-router";
import { opsPluginListQuerySchema } from "@becomeopc/dshx-hub-contracts";

import { listQuery, tokenRoute } from "@/lib/api/route";
import { listOpsPlugins } from "@/lib/catalog/operations";

export const Route = createFileRoute("/api/ops/v1/plugins/")({
  server: {
    handlers: {
      GET: tokenRoute(
        {
          envelope: "operation",
          query: (params) => ({
            state: listQuery(params, "state"),
            needs: listQuery(params, "needs"),
            source: listQuery(params, "source"),
            risk: listQuery(params, "risk"),
            observedBefore: params.get("observedBefore") ?? undefined,
            updatedBefore: params.get("updatedBefore") ?? undefined,
            limit: params.has("limit") ? Number(params.get("limit")) : undefined,
            cursor: params.get("cursor") ?? undefined,
          }),
          querySchema: opsPluginListQuerySchema,
        },
        ({ db, query }) => listOpsPlugins(db, query),
      ),
    },
  },
});
