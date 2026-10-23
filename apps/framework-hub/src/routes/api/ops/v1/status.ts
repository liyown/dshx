import { createFileRoute } from "@tanstack/react-router";

import { publicRoute, withMeta } from "@/lib/api/route";
import { authenticateApiToken } from "@/lib/auth/tokens.server";
import { getOpsStatus } from "@/lib/catalog/operations";
import { serializeOperationError } from "@/lib/catalog/operations-v1.http";
import { HttpError } from "@/lib/http";

export const Route = createFileRoute("/api/ops/v1/status")({
  server: {
    handlers: {
      // Anonymous callers get the public view; a token adds the caller's scopes.
      // A rejected token is a warning rather than a failure so the status of the
      // deployment is still readable while the caller repairs its credentials.
      GET: publicRoute({ envelope: "operation" }, async ({ request, db }) => {
        const warnings: unknown[] = [];
        let actor: Awaited<ReturnType<typeof authenticateApiToken>> | null = null;
        if (request.headers.has("authorization"))
          try {
            actor = await authenticateApiToken(db, request);
          } catch (error) {
            if (!(error instanceof HttpError) || error.status !== 401) throw error;
            warnings.push(serializeOperationError(error));
          }
        return withMeta(
          await getOpsStatus(db, {
            authenticated: actor !== null,
            scopes: actor?.token.scopesJson ?? [],
          }),
          { warnings },
        );
      }),
    },
  },
});
