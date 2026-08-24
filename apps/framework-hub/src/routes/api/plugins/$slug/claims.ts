import { and, eq } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { randomToken, sha256 } from "@/lib/auth/tokens.server";
import { claimCreateSchema } from "@/lib/catalog/contracts";
import { requireCommunityWrite } from "@/lib/community/guard.server";
import { pluginClaims, plugins } from "@/lib/db/schema";
import { HttpError, jsonError, readJson, uuid } from "@/lib/http";

export const Route = createFileRoute("/api/plugins/$slug/claims")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          const { session, db } = await requireSession(request, context);
          const input = await readJson(request, claimCreateSchema);
          await requireCommunityWrite(
            request,
            context,
            db,
            session.user.id,
            "claim",
            input.turnstileToken,
          );
          const [plugin] = await db
            .select()
            .from(plugins)
            .where(eq(plugins.slug, params.slug))
            .limit(1);
          if (!plugin?.primaryRepositoryId)
            throw new HttpError(404, "Plugin repository not found", "plugin_not_found");
          const [existing] = await db
            .select()
            .from(pluginClaims)
            .where(
              and(
                eq(pluginClaims.userId, session.user.id),
                eq(pluginClaims.idempotencyKey, input.idempotencyKey),
              ),
            )
            .limit(1);
          if (existing) return Response.json({ claim: existing, challengeToken: null });
          const challengeToken = randomToken("claim");
          const id = uuid();
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
          await db.insert(pluginClaims).values({
            id,
            pluginId: plugin.id,
            userId: session.user.id,
            repositoryId: plugin.primaryRepositoryId,
            challengeTokenHash: await sha256(challengeToken),
            idempotencyKey: input.idempotencyKey,
            expiresAt,
          });
          return Response.json(
            {
              claim: { id, pluginId: plugin.id, status: "pending", expiresAt },
              challengeToken,
              file: {
                path: ".github/dshx-hub-claim.json",
                body: { pluginId: plugin.id, claimToken: challengeToken },
              },
            },
            { status: 201 },
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
