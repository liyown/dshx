import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { appealCreateSchema } from "@/lib/community/contracts";
import { createAppeal, listAppeals } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/appeals/")({
  server: {
    handlers: {
      GET: sessionRoute({}, ({ db, session }) => listAppeals(db, session.user.id)),
      POST: sessionRoute(
        { body: appealCreateSchema, community: "appeal.create", status: 201 },
        ({ db, session, input }) => createAppeal(db, session.user.id, input),
      ),
    },
  },
});
