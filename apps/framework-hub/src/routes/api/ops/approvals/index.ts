import { createFileRoute } from "@tanstack/react-router";

import { adminOperations } from "@/lib/api/operations/admin";
import { createApproval, listActorApprovals } from "@/lib/approvals/service.server";

export const Route = createFileRoute("/api/ops/approvals/")({
  server: {
    handlers: {
      GET: adminOperations.listActorApprovals.route(({ db, token, profile }) =>
        listActorApprovals(db, { token, profile }),
      ),
      POST: adminOperations.createApproval.route(({ db, token, profile, input }) =>
        createApproval(db, { token, profile }, input),
      ),
    },
  },
});
