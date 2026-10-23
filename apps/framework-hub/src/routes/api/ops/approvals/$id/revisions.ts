import { createFileRoute } from "@tanstack/react-router";

import { adminOperations } from "@/lib/api/operations/admin";
import { reviseApproval } from "@/lib/approvals/service.server";

export const Route = createFileRoute("/api/ops/approvals/$id/revisions")({
  server: {
    handlers: {
      POST: adminOperations.reviseApproval.route(({ db, params, token, profile, input }) =>
        reviseApproval(db, params.id, { token, profile }, input),
      ),
    },
  },
});
