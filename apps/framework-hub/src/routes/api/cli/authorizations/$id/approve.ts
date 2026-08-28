import { createFileRoute } from "@tanstack/react-router";

import { createAuth } from "@/lib/auth/auth.server";
import {
  approveValidatedCliAuthorization,
  validateCliAuthorizationRequest,
} from "@/lib/auth/cli-authorization.application.server";
import { cliAuthorizationPageResponse } from "@/lib/auth/cli-page";
import { requireDatabase } from "@/lib/db/client";
import { HttpError, jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/cli/authorizations/$id/approve")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          const url = new URL(request.url);
          const state = url.searchParams.get("state") ?? "";
          const authorization = await validateCliAuthorizationRequest(db, {
            authorizationId: params.id,
            state,
          });
          const auth = createAuth(context);
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session)
            return cliAuthorizationPageResponse(request, {
              status: "connecting",
              returnTo: url.pathname + url.search,
            });
          const callback = await approveValidatedCliAuthorization(db, authorization, {
            state,
            userId: session.user.id,
          });
          return Response.redirect(callback, 302);
        } catch (error) {
          const accept = request.headers.get("accept") ?? "";
          if (accept.includes("text/html")) {
            if (!(error instanceof HttpError)) console.error(error);
            return cliAuthorizationPageResponse(request, {
              status: "error",
              reason:
                error instanceof HttpError && error.code === "invalid_state" ? "expired" : "server",
            });
          }
          return jsonError(error);
        }
      },
    },
  },
});
