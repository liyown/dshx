import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { listNotifications } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/notifications/")({
  server: {
    handlers: {
      GET: sessionRoute({}, ({ db, session }) => listNotifications(db, session.user.id)),
    },
  },
});
