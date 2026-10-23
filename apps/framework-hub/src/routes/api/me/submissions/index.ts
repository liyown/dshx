import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import {
  submissionCreateSchema,
  submissionSchema,
  submissionsPageSchema,
} from "@/lib/community/contracts";
import { createSubmission, listSubmissions } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/submissions/")({
  server: {
    handlers: {
      GET: sessionRoute({ response: submissionsPageSchema }, ({ db, session }) =>
        listSubmissions(db, session.user.id),
      ),
      POST: sessionRoute(
        {
          body: submissionCreateSchema,
          community: "submission.create",
          status: 201,
          response: submissionSchema,
        },
        ({ db, session, input }) =>
          createSubmission(db, {
            userId: session.user.id,
            submitterKey: `user:${session.user.id}`,
            repositoryUrl: input.repositoryUrl,
            idempotencyKey: input.idempotencyKey,
          }),
      ),
    },
  },
});
