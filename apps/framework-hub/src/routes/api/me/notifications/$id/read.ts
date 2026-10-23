import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { notificationReadSchema } from "@/lib/community/contracts";
import { readNotification } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/notifications/$id/read")({
  server: {
    handlers: {
      PUT: sessionRoute(
        { body: notificationReadSchema, community: "notification.read" },
        ({ db, session, params }) => readNotification(db, params.id, session.user.id),
      ),
    },
  },
});
