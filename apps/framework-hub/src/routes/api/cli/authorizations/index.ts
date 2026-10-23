import { createFileRoute } from "@tanstack/react-router";

import { publicRoute } from "@/lib/api/route";
import { createCliAuthorization } from "@/lib/auth/cli-authorization.application.server";
import { cliAuthorizationSchema } from "@/lib/auth/cli.contracts";
import { requireBindings } from "@/lib/db/context";

export const Route = createFileRoute("/api/cli/authorizations/")({
  server: {
    handlers: {
      POST: publicRoute(
        { body: cliAuthorizationSchema, status: 201 },
        ({ request, context, db, input }) =>
          createCliAuthorization(
            db,
            input,
            requireBindings(context).SITE_URL ?? new URL(request.url).origin,
          ),
      ),
    },
  },
});
