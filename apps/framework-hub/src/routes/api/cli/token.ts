import { createFileRoute } from "@tanstack/react-router";

import { cliOperations } from "@/lib/api/operations/cli";
import { exchangeCliToken, revokeToken } from "@/lib/auth/cli.server";

export const Route = createFileRoute("/api/cli/token")({
  server: {
    handlers: {
      POST: cliOperations.exchangeCliToken.route(({ db, input }) => exchangeCliToken(db, input)),
      GET: cliOperations.inspectCliToken.route(({ profile, token }) => ({
        user: { id: profile.userId, login: profile.githubLogin, role: profile.role },
        token: { prefix: token.tokenPrefix, scopes: token.scopesJson, expiresAt: token.expiresAt },
      })),
      // Revocation identifies the token by the bearer header itself, so it is not
      // authenticated: an expired or unknown token still answers 204.
      DELETE: cliOperations.revokeCliToken.route(async ({ request, db }) => {
        await revokeToken(
          db,
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""),
        );
        return new Response(null, { status: 204 });
      }),
    },
  },
});
