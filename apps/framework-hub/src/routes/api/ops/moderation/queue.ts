import { createFileRoute } from "@tanstack/react-router";

import { adminOperations } from "@/lib/api/operations/admin";
import { listModerationQueue } from "@/lib/community/moderation.server";

export const Route = createFileRoute("/api/ops/moderation/queue")({
  server: {
    handlers: {
      GET: adminOperations.listModerationQueue.route(async ({ db }) => ({
        items: await listModerationQueue(db),
      })),
    },
  },
});
