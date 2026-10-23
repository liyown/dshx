import { createFileRoute } from "@tanstack/react-router";

import { publicRoute } from "@/lib/api/route";
import { getOptionalSession } from "@/lib/auth/auth.server";
import { submissionCreateSchema, submissionSchema } from "@/lib/community/contracts";
import { anonymousSubmissionKey, createSubmission } from "@/lib/community/submissions.server";
import { verifyTurnstileToken } from "@/lib/community/verification.server";
import { requireBindings } from "@/lib/db/context";

export const Route = createFileRoute("/api/submissions/")({
  server: {
    handlers: {
      // Public and anonymous: a signed-in submitter is attributed, a signed-out one is
      // keyed by address and must pass Turnstile. The constructor already refuses
      // cross-origin writes.
      POST: publicRoute(
        {
          body: submissionCreateSchema,
          status: 201,
          headers: { "cache-control": "no-store" },
          response: submissionSchema,
        },
        async ({ request, context, db, input }) => {
          const [auth] = await Promise.all([
            getOptionalSession(request, context),
            verifyTurnstileToken(request, context, input.turnstileToken),
          ]);
          const userId = auth?.session.user.id ?? null;
          const submitterKey = userId
            ? `user:${userId}`
            : await anonymousSubmissionKey(request, requireBindings(context).BETTER_AUTH_SECRET!);
          return createSubmission(db, {
            userId,
            submitterKey,
            repositoryUrl: input.repositoryUrl,
            idempotencyKey: input.idempotencyKey,
          });
        },
      ),
    },
  },
});
