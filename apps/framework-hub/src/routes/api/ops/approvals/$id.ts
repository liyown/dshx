import { createFileRoute } from "@tanstack/react-router";

import { adminOperations } from "@/lib/api/operations/admin";
import { getRequesterApproval } from "@/lib/approvals/service.server";

export const Route = createFileRoute("/api/ops/approvals/$id")({
  server: {
    handlers: {
      GET: adminOperations.getRequesterApproval.route(({ db, params, token, profile }) =>
        getRequesterApproval(db, params.id, { token, profile }),
      ),
    },
  },
});
