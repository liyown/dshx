import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { submissionCreateSchema } from "@/lib/community/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { createSubmission, listSubmissions } from "@/lib/community/marketplace.server";
import { requireD1 } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/me/submissions/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const auth = await requireSession(request, context);
          return Response.json(await listSubmissions(requireD1(context), auth.session.user.id));
        } catch (error) {
          return jsonError(error);
        }
      },
      POST: async ({ request, context }) => {
        try {
          const auth = await requireSession(request, context);
          const input = await readJson(request, submissionCreateSchema);
          await requireCommunityWrite(
            request,
            context,
            auth.db,
            auth.session.user.id,
            "submission.create",
            input.turnstileToken,
          );
          return Response.json(
            await createSubmission(
              requireD1(context),
              auth.session.user.id,
              input.repositoryUrl,
              input.idempotencyKey,
            ),
            { status: 201 },
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
