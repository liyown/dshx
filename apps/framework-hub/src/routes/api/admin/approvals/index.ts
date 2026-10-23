import { createFileRoute } from "@tanstack/react-router";

import { adminRoute } from "@/lib/api/route";
import { approvalListQuerySchema } from "@/lib/approvals/contracts";
import { listApprovals } from "@/lib/approvals/service.server";

export const Route = createFileRoute("/api/admin/approvals/")({
  server: {
    handlers: {
      GET: adminRoute(
        {
          query: (params) => ({
            status: params.get("status"),
            kind: params.get("kind"),
            risk: params.get("risk"),
            limit: params.get("limit") ?? 100,
          }),
          querySchema: approvalListQuerySchema,
        },
        ({ db, query }) => listApprovals(db, query),
      ),
    },
  },
});
