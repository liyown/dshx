import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { approvalCreateSchema } from "@/lib/approvals/contracts";
import { createApproval, listActorApprovals } from "@/lib/approvals/service.server";

const scope = "approvals:write";

export const Route = createFileRoute("/api/ops/approvals/")({
  server: {
    handlers: {
      GET: tokenRoute({ scope }, ({ db, token, profile }) =>
        listActorApprovals(db, { token, profile }),
      ),
      POST: tokenRoute(
        { scope, body: approvalCreateSchema, status: 201 },
        ({ db, token, profile, input }) => createApproval(db, { token, profile }, input),
      ),
    },
  },
});
