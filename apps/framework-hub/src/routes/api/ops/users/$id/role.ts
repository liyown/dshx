import { createFileRoute } from "@tanstack/react-router";

import { createApproval } from "@/lib/approvals/service.server";
import { requireApiToken } from "@/lib/auth/tokens.server";
import { userRoleSchema } from "@/lib/catalog/contracts";
import { requireD1, requireDatabase } from "@/lib/db/client";
import { HttpError, jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/ops/users/$id/role")({
  server: {
    handlers: {
      PUT: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          const actor = await requireApiToken(db, request, "users:write");
          if (actor.profile.role !== "admin")
            throw new HttpError(403, "Administrator role required", "forbidden");
          const input = await readJson(request, userRoleSchema);
          const approval = await createApproval(requireD1(context), actor, {
            kind: "role_change",
            risk: "critical",
            subjectType: "user",
            subjectId: params.id,
            title: `Change user role to ${input.role}`,
            summary: input.reason,
            evidence: { requestedRole: input.role, requestedBy: actor.token.userId },
            effect: {
              kind: "set_user_role",
              executionMode: "server",
              input: { userId: params.id, role: input.role },
            },
            preconditions: {},
            policyVersion: "dshx-approvals-1",
            idempotencyKey: input.idempotencyKey,
          });
          return Response.json({ approval, requiresApproval: true }, { status: 202 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
