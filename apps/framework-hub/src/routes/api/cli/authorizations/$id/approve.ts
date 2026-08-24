import { and, eq, gt } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";

import { createAuth } from "@/lib/auth/auth.server";
import { getProfileForApproval } from "@/lib/auth/cli.server";
import { cliAuthorizationPageResponse } from "@/lib/auth/cli-page";
import { randomToken, sha256 } from "@/lib/auth/tokens.server";
import { requireDatabase } from "@/lib/db/client";
import { cliAuthorizations } from "@/lib/db/schema";
import { HttpError, jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/cli/authorizations/$id/approve")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          const url = new URL(request.url);
          const state = url.searchParams.get("state") ?? "";
          const [authorization] = await db
            .select()
            .from(cliAuthorizations)
            .where(
              and(
                eq(cliAuthorizations.id, params.id),
                eq(cliAuthorizations.status, "pending"),
                gt(cliAuthorizations.expiresAt, new Date()),
              ),
            )
            .limit(1);
          if (!authorization || (await sha256(state)) !== authorization.stateHash)
            throw new HttpError(400, "Authorization state is invalid or expired", "invalid_state");
          const auth = createAuth(context);
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session)
            return cliAuthorizationPageResponse(request, {
              status: "connecting",
              returnTo: url.pathname + url.search,
            });
          await getProfileForApproval(db, session.user.id);
          const code = randomToken("code");
          await db
            .update(cliAuthorizations)
            .set({
              status: "approved",
              approvedByUserId: session.user.id,
              exchangeCodeHash: await sha256(code),
              approvedAt: new Date(),
            })
            .where(eq(cliAuthorizations.id, authorization.id));
          const callback = new URL(authorization.callbackUrl);
          callback.searchParams.set("authorization_id", authorization.id);
          callback.searchParams.set("code", code);
          callback.searchParams.set("state", state);
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
