import { createFileRoute } from "@tanstack/react-router";

import { sessionRoute } from "@/lib/api/route";
import { accountDeleteSchema, accountDeletionSchema } from "@/lib/community/contracts";
import { anonymizeAccount } from "@/lib/community/membership.server";

export const Route = createFileRoute("/api/me/account")({
  server: {
    handlers: {
      DELETE: sessionRoute(
        { body: accountDeleteSchema, community: "account.delete", response: accountDeletionSchema },
        ({ db, session }) => anonymizeAccount(db, session.user.id),
      ),
    },
  },
});
