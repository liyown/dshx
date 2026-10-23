import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { notificationReadResultSchema, notificationReadSchema } from "@/lib/community/contracts";
import { readNotification } from "@/lib/community/notifications.server";

export const Route = createFileRoute("/api/me/notifications/$id/read")({
  server: {
    handlers: {
      PUT: sessionRoute(
        {
          body: notificationReadSchema,
          community: "notification.read",
          response: notificationReadResultSchema,
        },
        ({ db, session, params }) => readNotification(db, params.id, session.user.id),
      ),
    },
  },
});
