import { createFileRoute } from "@tanstack/react-router";

import { publicRoute } from "@/lib/api/route";
import { getPublicUser } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/users/$login")({
  server: {
    handlers: {
      GET: publicRoute({}, ({ db, params }) => getPublicUser(db, params.login)),
    },
  },
});
