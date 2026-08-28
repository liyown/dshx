import { createFileRoute } from "@tanstack/react-router";

import { cliTokenExchangeSchema } from "@/lib/auth/cli.contracts";
import { exchangeCliToken, revokeToken } from "@/lib/auth/cli.server";
import { requireApiToken } from "@/lib/auth/tokens.server";
import { requireDatabase } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/cli/token")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          return Response.json(
            await exchangeCliToken(
              requireDatabase(context),
              await readJson(request, cliTokenExchangeSchema),
            ),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
      GET: async ({ request, context }) => {
        try {
          const actor = await requireApiToken(requireDatabase(context), request, "catalog:write");
          return Response.json({
            user: {
              id: actor.profile.userId,
              login: actor.profile.githubLogin,
              role: actor.profile.role,
            },
            token: {
              prefix: actor.token.tokenPrefix,
              scopes: actor.token.scopesJson,
              expiresAt: actor.token.expiresAt,
            },
          });
        } catch (error) {
          return jsonError(error);
        }
      },
      DELETE: async ({ request, context }) => {
        try {
          const raw = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/, "");
          await revokeToken(requireDatabase(context), raw);
          return new Response(null, { status: 204 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
