import { createFileRoute } from "@tanstack/react-router";
import { operationAuditQuerySchema } from "@becomeopc/dshx-hub-contracts";

import { tokenRoute } from "@/lib/api/route";
import { auditOperations } from "@/lib/catalog/operations";
import { requireBindings } from "@/lib/db/context";

export const Route = createFileRoute("/api/ops/v1/audit")({
  server: {
    handlers: {
      GET: tokenRoute(
        {
          envelope: "operation",
          query: (params) => ({ scope: params.get("scope") ?? undefined }),
          querySchema: operationAuditQuerySchema,
        },
        ({ db, context, query }) =>
          auditOperations(db, requireBindings(context).PLUGIN_MEDIA, query.scope),
      ),
    },
  },
});
