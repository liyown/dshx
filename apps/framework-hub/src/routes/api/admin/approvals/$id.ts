import { createFileRoute } from "@tanstack/react-router";

import { adminRoute } from "@/lib/api/route";
import { getApprovalDetail } from "@/lib/approvals/service.server";

export const Route = createFileRoute("/api/admin/approvals/$id")({
  server: {
    handlers: {
      GET: adminRoute({}, ({ db, params }) => getApprovalDetail(db, params.id)),
    },
  },
});
