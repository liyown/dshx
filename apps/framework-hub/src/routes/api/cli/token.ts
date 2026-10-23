import { createFileRoute } from "@tanstack/react-router";

import { publicRoute, tokenRoute } from "@/lib/api/route";
import { cliTokenExchangeSchema } from "@/lib/auth/cli.contracts";
import { exchangeCliToken, revokeToken } from "@/lib/auth/cli.server";

export const Route = createFileRoute("/api/cli/token")({
  server: {
    handlers: {
      POST: publicRoute({ body: cliTokenExchangeSchema }, ({ db, input }) =>
        exchangeCliToken(db, input),
      ),
      GET: tokenRoute({}, ({ profile, token }) => ({
        user: { id: profile.userId, login: profile.githubLogin, role: profile.role },
        token: { prefix: token.tokenPrefix, scopes: token.scopesJson, expiresAt: token.expiresAt },
      })),
      // Revocation identifies the token by the bearer header itself, so it is not
      // authenticated: an expired or unknown token still answers 204.
      DELETE: publicRoute({}, async ({ request, db }) => {
        await revokeToken(
          db,
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""),
        );
        return new Response(null, { status: 204 });
      }),
    },
  },
});
