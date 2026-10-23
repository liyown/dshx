import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { getRequesterApproval } from "@/lib/approvals/service.server";

export const Route = createFileRoute("/api/ops/approvals/$id")({
  server: {
    handlers: {
      GET: tokenRoute({ scope: "approvals:write" }, ({ db, params, token, profile }) =>
        getRequesterApproval(db, params.id, { token, profile }),
      ),
    },
  },
});
