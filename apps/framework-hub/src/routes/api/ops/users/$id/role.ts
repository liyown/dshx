import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { createApproval } from "@/lib/approvals/service.server";
import { userRoleSchema } from "@/lib/catalog/contracts";

export const Route = createFileRoute("/api/ops/users/$id/role")({
  server: {
    handlers: {
      // A role change is never applied here: it is queued as a critical approval.
      PUT: tokenRoute(
        { scope: "users:write", role: "admin", body: userRoleSchema, status: 202 },
        async ({ db, params, token, profile, input }) => ({
          approval: await createApproval(
            db,
            { token, profile },
            {
              kind: "role_change",
              risk: "critical",
              subjectType: "user",
              subjectId: params.id,
              title: `Change user role to ${input.role}`,
              summary: input.reason,
              evidence: { requestedRole: input.role, requestedBy: token.userId },
              effect: {
                kind: "set_user_role",
                executionMode: "server",
                input: { userId: params.id, role: input.role },
              },
              preconditions: {},
              policyVersion: "dshx-approvals-1",
              idempotencyKey: input.idempotencyKey,
            },
          ),
          requiresApproval: true,
        }),
      ),
    },
  },
});
