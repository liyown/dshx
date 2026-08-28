import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { reportCreateSchema } from "@/lib/catalog/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { createContentReport } from "@/lib/community/report.application.server";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/reports/")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const { session, db } = await requireSession(request, context);
          const input = await readJson(request, reportCreateSchema);
          await requireCommunityWrite(
            request,
            context,
            db,
            session.user.id,
            "report",
            input.turnstileToken,
          );
          const result = await createContentReport(db, {
            ...input,
            reporterUserId: session.user.id,
          });
          return Response.json(result.report, { status: result.created ? 201 : 200 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
