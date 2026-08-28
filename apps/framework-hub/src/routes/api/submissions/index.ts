import { createFileRoute } from "@tanstack/react-router";

import { getOptionalSession, requireSameOrigin } from "@/lib/auth/auth.server";
import { submissionCreateSchema } from "@/lib/community/contracts";
import { anonymousSubmissionKey, createSubmission } from "@/lib/community/marketplace.server";
import { verifyTurnstileToken } from "@/lib/community/verification.server";
import { requireDatabase } from "@/lib/db/client";
import { requireBindings } from "@/lib/db/context";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/submissions/")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          requireSameOrigin(request, context);
          const input = await readJson(request, submissionCreateSchema);
          const [auth] = await Promise.all([
            getOptionalSession(request, context),
            verifyTurnstileToken(request, context, input.turnstileToken),
          ]);
          const userId = auth?.session.user.id ?? null;
          const bindings = requireBindings(context);
          const submitterKey = userId
            ? `user:${userId}`
            : await anonymousSubmissionKey(request, bindings.BETTER_AUTH_SECRET!);
          return Response.json(
            await createSubmission(requireDatabase(context), {
              userId,
              submitterKey,
              repositoryUrl: input.repositoryUrl,
              idempotencyKey: input.idempotencyKey,
            }),
            { status: 201, headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
