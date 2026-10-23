import { createFileRoute } from "@tanstack/react-router";

import { cliOperations } from "@/lib/api/operations/cli";
import { createCliAuthorization } from "@/lib/auth/cli-authorization.application.server";
import { requireBindings } from "@/lib/db/context";

export const Route = createFileRoute("/api/cli/authorizations/")({
  server: {
    handlers: {
      POST: cliOperations.createCliAuthorization.route(({ request, context, db, input }) =>
        createCliAuthorization(
          db,
          input,
          requireBindings(context).SITE_URL ?? new URL(request.url).origin,
        ),
      ),
    },
  },
});
