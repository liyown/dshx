import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { profileSchema, profileUpdateSchema } from "@/lib/community/contracts";
import { getMe, updateProfile } from "@/lib/community/membership.server";

export const Route = createFileRoute("/api/me/profile")({
  server: {
    handlers: {
      GET: sessionRoute({ response: profileSchema }, ({ db, session }) =>
        getMe(db, session.user.id),
      ),
      PUT: sessionRoute(
        { body: profileUpdateSchema, community: "profile.update", response: profileSchema },
        ({ db, session, input }) => updateProfile(db, session.user.id, input),
      ),
    },
  },
});
