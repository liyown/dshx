import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { approvalRevisionSchema } from "@/lib/approvals/contracts";
import { reviseApproval } from "@/lib/approvals/service.server";

export const Route = createFileRoute("/api/ops/approvals/$id/revisions")({
  server: {
    handlers: {
      POST: tokenRoute(
        { scope: "approvals:write", body: approvalRevisionSchema },
        ({ db, params, token, profile, input }) =>
          reviseApproval(db, params.id, { token, profile }, input),
      ),
    },
  },
});
