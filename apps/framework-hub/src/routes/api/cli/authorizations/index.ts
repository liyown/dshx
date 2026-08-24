import { createFileRoute } from "@tanstack/react-router";

import { cliAuthorizationSchema, assertLoopbackCallback } from "@/lib/auth/cli.server";
import { sha256 } from "@/lib/auth/tokens.server";
import { requireDatabase } from "@/lib/db/client";
import { requireBindings } from "@/lib/db/context";
import { cliAuthorizations } from "@/lib/db/schema";
import { jsonError, readJson, uuid } from "@/lib/http";

export const Route = createFileRoute("/api/cli/authorizations/")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const input = await readJson(request, cliAuthorizationSchema);
          assertLoopbackCallback(input.callbackUrl);
          const id = uuid();
          const expiresAt = new Date(Date.now() + 10 * 60_000);
          await requireDatabase(context)
            .insert(cliAuthorizations)
            .values({
              id,
              stateHash: await sha256(input.state),
              codeChallenge: input.codeChallenge,
              callbackUrl: input.callbackUrl,
              requestedScopesJson: input.scopes,
              expiresAt,
            });
          const site = requireBindings(context).SITE_URL ?? new URL(request.url).origin;
          const authorizeUrl = new URL(`/api/cli/authorizations/${id}/approve`, site);
          authorizeUrl.searchParams.set("state", input.state);
          return Response.json(
            { id, authorizeUrl, expiresAt: expiresAt.toISOString() },
            { status: 201 },
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
