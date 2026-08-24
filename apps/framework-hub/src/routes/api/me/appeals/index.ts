import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { appealCreateSchema } from "@/lib/community/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { createAppeal, listAppeals } from "@/lib/community/marketplace.server";
import { requireD1 } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/me/appeals/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const auth = await requireSession(request, context);
          return Response.json(await listAppeals(requireD1(context), auth.session.user.id));
        } catch (error) {
          return jsonError(error);
        }
      },
      POST: async ({ request, context }) => {
        try {
          const auth = await requireSession(request, context);
          const input = await readJson(request, appealCreateSchema);
          await requireCommunityWrite(
            request,
            context,
            auth.db,
            auth.session.user.id,
            "appeal.create",
            input.turnstileToken,
          );
          return Response.json(
            await createAppeal(requireD1(context), auth.session.user.id, input),
            { status: 201 },
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
