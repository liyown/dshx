import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { notificationReadSchema } from "@/lib/community/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { readNotification } from "@/lib/community/marketplace.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/me/notifications/$id/read")({
  server: {
    handlers: {
      PUT: async ({ request, context, params }) => {
        try {
          const auth = await requireSession(request, context);
          const input = await readJson(request, notificationReadSchema);
          await requireCommunityWrite(
            request,
            context,
            auth.db,
            auth.session.user.id,
            "notification.read",
            input.turnstileToken,
          );
          return Response.json(
            await readNotification(requireDatabase(context), params.id, auth.session.user.id),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
