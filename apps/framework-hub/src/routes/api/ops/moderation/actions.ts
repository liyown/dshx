import { createFileRoute } from "@tanstack/react-router";

import { createApproval } from "@/lib/approvals/service.server";
import { requireApiToken } from "@/lib/auth/tokens.server";
import { moderationActionSchema } from "@/lib/catalog/contracts";
import { applyModerationAction } from "@/lib/community/moderation.server";
import { requireDatabase } from "@/lib/db/client";
import { HttpError, jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/ops/moderation/actions")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          const actor = await requireApiToken(db, request, "moderation:write");
          if (!(["moderator", "admin"] as string[]).includes(actor.profile.role))
            throw new HttpError(403, "Moderator role required", "forbidden");
          const input = await readJson(request, moderationActionSchema);
          if (["restore", "unrestrict", "ban", "unban"].includes(input.action)) {
            const contentRestore = input.action === "restore";
            const idempotencyKey = request.headers.get("idempotency-key");
            if (!idempotencyKey)
              throw new HttpError(422, "Idempotency-Key header required", "idempotency_required");
            const approval = await createApproval(requireDatabase(context), actor, {
              kind: contentRestore ? "content_restore" : "permanent_access_change",
              risk: contentRestore ? "high" : "critical",
              subjectType: contentRestore ? (input.targetType as "review" | "reply") : "user",
              subjectId: input.targetId,
              title: contentRestore
                ? `Restore ${input.targetType} content`
                : `${input.action} user access`,
              summary: input.reason,
              evidence: {
                reportIds: input.reportIds,
                decisionCode: input.decisionCode,
                confidence: input.confidence,
                metadata: input.metadata,
              },
              effect: contentRestore
                ? {
                    kind: "restore_content",
                    executionMode: "server",
                    input: { targetType: input.targetType, targetId: input.targetId },
                  }
                : {
                    kind: "set_user_access",
                    executionMode: "server",
                    input: { userId: input.targetId, action: input.action, reason: input.reason },
                  },
              preconditions: {},
              policyVersion: input.policyVersion ?? "dshx-community-1",
              idempotencyKey,
            });
            return Response.json({ approval, requiresApproval: true }, { status: 202 });
          }
          const action = await applyModerationAction(
            requireDatabase(context),
            actor.token.id,
            input,
          );
          return Response.json(action, { status: 201 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
