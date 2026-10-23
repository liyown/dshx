import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { appealCreateSchema, appealSchema, appealsPageSchema } from "@/lib/community/contracts";
import { createAppeal, listAppeals } from "@/lib/community/marketplace.server";

export const Route = createFileRoute("/api/me/appeals/")({
  server: {
    handlers: {
      GET: sessionRoute({ response: appealsPageSchema }, ({ db, session }) =>
        listAppeals(db, session.user.id),
      ),
      POST: sessionRoute(
        {
          body: appealCreateSchema,
          community: "appeal.create",
          status: 201,
          response: appealSchema,
        },
        ({ db, session, input }) => createAppeal(db, session.user.id, input),
      ),
    },
  },
});
