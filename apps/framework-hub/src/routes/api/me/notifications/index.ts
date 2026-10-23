import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { notificationsPageSchema } from "@/lib/community/contracts";
import { listNotifications } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/notifications/")({
  server: {
    handlers: {
      GET: sessionRoute({ response: notificationsPageSchema }, ({ db, session }) =>
        listNotifications(db, session.user.id),
      ),
    },
  },
});
