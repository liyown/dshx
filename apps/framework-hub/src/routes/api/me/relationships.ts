import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { listRelationships } from "@/lib/community/marketplace.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/me/relationships")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const auth = await requireSession(request, context);
          return Response.json(
            await listRelationships(requireDatabase(context), auth.session.user.id),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
