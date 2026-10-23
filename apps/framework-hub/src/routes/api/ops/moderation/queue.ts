import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { listModerationQueue } from "@/lib/community/moderation.server";

export const Route = createFileRoute("/api/ops/moderation/queue")({
  server: {
    handlers: {
      GET: tokenRoute({ scope: "moderation:write" }, async ({ db }) => ({
        items: await listModerationQueue(db),
      })),
    },
  },
});
