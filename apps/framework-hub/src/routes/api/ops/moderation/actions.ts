import { createFileRoute } from "@tanstack/react-router";
import type { z } from "zod";

import { adminOperations } from "@/lib/api/operations/admin";
import type { ApprovalCreateInput } from "@/lib/approvals/contracts";
import { createApproval, type TokenActor } from "@/lib/approvals/service.server";
import { moderationActionSchema } from "@/lib/catalog/contracts";
import { applyModerationAction, enforcementEffect } from "@/lib/community/moderation.server";
import { HttpError } from "@/lib/http";

type ModerationAction = z.infer<typeof moderationActionSchema>;

/** Access changes and restores are approval-gated; the rest apply immediately. */
const gatedActions = ["restore", "unrestrict", "ban", "unban"] as const;
type GatedAction = (typeof gatedActions)[number];

function isGated(action: ModerationAction["action"]): action is GatedAction {
  return (gatedActions as readonly string[]).includes(action);
}

export const Route = createFileRoute("/api/ops/moderation/actions")({
  server: {
    handlers: {
      POST: adminOperations.applyModerationAction.route(
        async ({ request, db, token, profile, input }) => {
          if (!isGated(input.action))
            return Response.json(await applyModerationAction(db, token.id, input), { status: 201 });
          const idempotencyKey = request.headers.get("idempotency-key");
          if (!idempotencyKey)
            throw new HttpError(422, "Idempotency-Key header required", "idempotency_required");
          const actor: TokenActor = { token, profile };
          const approval = await createApproval(db, actor, {
            ...approvalFor({ ...input, action: input.action }),
            idempotencyKey,
          });
          return Response.json({ approval, requiresApproval: true }, { status: 202 });
        },
      ),
    },
  },
});

function approvalFor(
  input: ModerationAction & { action: GatedAction },
): Omit<ApprovalCreateInput, "idempotencyKey"> {
  const contentRestore = input.action === "restore";
  return {
    kind: contentRestore ? "content_restore" : "permanent_access_change",
    risk: contentRestore ? "high" : "critical",
    subjectType: contentRestore ? (input.targetType as "review" | "reply") : "user",
    subjectId: input.targetId,
    title: contentRestore ? `Restore ${input.targetType} content` : `${input.action} user access`,
    summary: input.reason,
    evidence: {
      reportIds: input.reportIds,
      decisionCode: input.decisionCode,
      confidence: input.confidence,
      metadata: input.metadata,
    },
    effect: enforcementEffect({
      action: input.action,
      target: {
        type: contentRestore ? (input.targetType as "review" | "reply") : "user",
        id: input.targetId,
      },
      reason: input.reason,
    }),
    preconditions: {},
    policyVersion: input.policyVersion ?? "dshx-community-1",
  };
}
