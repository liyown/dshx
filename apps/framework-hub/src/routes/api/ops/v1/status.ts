import { createFileRoute } from "@tanstack/react-router";

import { authenticateApiToken } from "@/lib/auth/tokens.server";
import { getOpsStatus } from "@/lib/catalog/operations-v1.server";
import {
  operationFailure,
  operationSuccess,
  serializeOperationError,
} from "@/lib/catalog/operations-v1.http";
import { requireD1, requireDatabase } from "@/lib/db/client";
import { HttpError } from "@/lib/http";

export const Route = createFileRoute("/api/ops/v1/status")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const authorization = request.headers.get("authorization");
          let auth = null;
          const warnings: unknown[] = [];
          if (authorization)
            try {
              auth = await authenticateApiToken(requireDatabase(context), request);
            } catch (error) {
              if (!(error instanceof HttpError) || error.status !== 401) throw error;
              warnings.push(serializeOperationError(error));
            }
          return operationSuccess(
            request,
            await getOpsStatus(requireD1(context), {
              authenticated: Boolean(auth),
              scopes: auth?.token.scopesJson ?? [],
            }),
            { warnings },
          );
        } catch (error) {
          return operationFailure(request, error);
        }
      },
    },
  },
});
