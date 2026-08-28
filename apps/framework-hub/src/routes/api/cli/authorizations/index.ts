import { createFileRoute } from "@tanstack/react-router";

import { createCliAuthorization } from "@/lib/auth/cli-authorization.application.server";
import { cliAuthorizationSchema } from "@/lib/auth/cli.contracts";
import { requireDatabase } from "@/lib/db/client";
import { requireBindings } from "@/lib/db/context";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/cli/authorizations/")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const input = await readJson(request, cliAuthorizationSchema);
          const site = requireBindings(context).SITE_URL ?? new URL(request.url).origin;
          const result = await createCliAuthorization(requireDatabase(context), input, site);
          return Response.json(result, { status: 201 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
