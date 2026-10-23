import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { reportCreateSchema } from "@/lib/catalog/contracts";
import { createContentReport } from "@/lib/community/report.application.server";

export const Route = createFileRoute("/api/reports/")({
  server: {
    handlers: {
      POST: sessionRoute(
        { body: reportCreateSchema, community: "report" },
        async ({ db, session, input }) => {
          // Re-reporting existing content is a no-op, so only a new report is a creation.
          const result = await createContentReport(db, {
            ...input,
            reporterUserId: session.user.id,
          });
          return Response.json(result.report, { status: result.created ? 201 : 200 });
        },
      ),
    },
  },
});
