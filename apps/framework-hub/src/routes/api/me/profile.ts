import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { profileUpdateSchema } from "@/lib/community/contracts";
import { getMe, updateProfile } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/profile")({
  server: {
    handlers: {
      GET: sessionRoute({}, ({ db, session }) => getMe(db, session.user.id)),
      PUT: sessionRoute(
        { body: profileUpdateSchema, community: "profile.update" },
        ({ db, session, input }) => updateProfile(db, session.user.id, input),
      ),
    },
  },
});
