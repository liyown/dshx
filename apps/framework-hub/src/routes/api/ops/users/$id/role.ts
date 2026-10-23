import { createFileRoute } from "@tanstack/react-router";

import { adminOperations } from "@/lib/api/operations/admin";
import { createApproval } from "@/lib/approvals/service.server";

export const Route = createFileRoute("/api/ops/users/$id/role")({
  server: {
    handlers: {
      // A role change is never applied here: it is queued as a critical approval.
      PUT: adminOperations.setUserRole.route(async ({ db, params, token, profile, input }) => ({
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
      })),
    },
  },
});
