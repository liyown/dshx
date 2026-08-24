import { and, eq, gt } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";

import { requireSession } from "@/lib/auth/auth.server";
import { sha256 } from "@/lib/auth/tokens.server";
import { claimVerifySchema } from "@/lib/catalog/contracts";
import { pluginClaims, pluginMaintainers, repositories } from "@/lib/db/schema";
import { HttpError, jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/claims/$id/verify")({
  server: {
    handlers: {
      POST: async ({ request, context, params }) => {
        try {
          const { session, db } = await requireSession(request, context);
          const input = await readJson(request, claimVerifySchema);
          const [row] = await db
            .select({ claim: pluginClaims, repository: repositories })
            .from(pluginClaims)
            .innerJoin(repositories, eq(repositories.id, pluginClaims.repositoryId))
            .where(
              and(
                eq(pluginClaims.id, params.id),
                eq(pluginClaims.userId, session.user.id),
                eq(pluginClaims.status, "pending"),
                gt(pluginClaims.expiresAt, new Date()),
              ),
            )
            .limit(1);
          if (!row) throw new HttpError(404, "Active claim not found", "claim_not_found");
          if ((await sha256(input.challengeToken)) !== row.claim.challengeTokenHash)
            throw new HttpError(422, "Challenge token does not match", "claim_token_mismatch");
          const rawUrl = `https://raw.githubusercontent.com/${row.repository.fullName}/${encodeURIComponent(row.repository.defaultBranch)}/${row.claim.challengePath}`;
          const response = await fetch(rawUrl, {
            headers: { accept: "application/vnd.github.raw+json" },
          });
          if (!response.ok)
            throw new HttpError(
              422,
              "Claim file is not present on the default branch",
              "claim_file_missing",
            );
          const file = (await response.json()) as { pluginId?: unknown; claimToken?: unknown };
          if (file.pluginId !== row.claim.pluginId || file.claimToken !== input.challengeToken) {
            throw new HttpError(422, "Claim file contents do not match", "claim_file_mismatch");
          }
          await db.batch([
            db
              .update(pluginClaims)
              .set({ status: "verified", verifiedAt: new Date() })
              .where(eq(pluginClaims.id, row.claim.id)),
            db
              .insert(pluginMaintainers)
              .values({
                pluginId: row.claim.pluginId,
                userId: session.user.id,
                role: "owner",
                source: "claim",
                claimId: row.claim.id,
              })
              .onConflictDoUpdate({
                target: [pluginMaintainers.pluginId, pluginMaintainers.userId],
                set: { revokedAt: null, source: "claim", claimId: row.claim.id },
              }),
          ]);
          return Response.json({ id: row.claim.id, status: "verified" });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
