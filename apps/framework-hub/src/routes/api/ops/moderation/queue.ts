import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { listModerationQueue } from "@/lib/community/moderation.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/ops/moderation/queue")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "moderation:write");
          return Response.json({ items: await listModerationQueue(requireDatabase(context)) });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
