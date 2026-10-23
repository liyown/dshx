import { createFileRoute } from "@tanstack/react-router";
import { submissionListQuerySchema } from "@becomeopc/dshx-hub-contracts";

import { listQuery, tokenRoute } from "@/lib/api/route";
import { listOpsSubmissions } from "@/lib/catalog/operations";

export const Route = createFileRoute("/api/ops/v1/submissions/")({
  server: {
    handlers: {
      GET: tokenRoute(
        {
          envelope: "operation",
          query: (params) => ({
            status: listQuery(params, "status"),
            limit: params.has("limit") ? Number(params.get("limit")) : undefined,
            cursor: params.get("cursor") ?? undefined,
          }),
          querySchema: submissionListQuerySchema,
        },
        ({ db, query }) => listOpsSubmissions(db, query),
      ),
    },
  },
});
