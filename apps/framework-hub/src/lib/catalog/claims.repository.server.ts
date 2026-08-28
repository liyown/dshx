import { and, eq, gt } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { pluginClaims, pluginMaintainers, plugins, repositories } from "@/lib/db/schema";

export async function findClaimablePlugin(db: Database, slug: string) {
  const [plugin] = await db.select().from(plugins).where(eq(plugins.slug, slug)).limit(1);
  return plugin ?? null;
}

export async function findClaimByIdempotencyKey(
  db: Database,
  userId: string,
  idempotencyKey: string,
) {
  const [claim] = await db
    .select()
    .from(pluginClaims)
    .where(and(eq(pluginClaims.userId, userId), eq(pluginClaims.idempotencyKey, idempotencyKey)))
    .limit(1);
  return claim ?? null;
}

export async function insertPluginClaim(db: Database, value: typeof pluginClaims.$inferInsert) {
  await db.insert(pluginClaims).values(value);
}

export async function findActivePluginClaim(db: Database, id: string, userId: string) {
  const [row] = await db
    .select({ claim: pluginClaims, repository: repositories })
    .from(pluginClaims)
    .innerJoin(repositories, eq(repositories.id, pluginClaims.repositoryId))
    .where(
      and(
        eq(pluginClaims.id, id),
        eq(pluginClaims.userId, userId),
        eq(pluginClaims.status, "pending"),
        gt(pluginClaims.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function markPluginClaimVerified(
  db: Database,
  input: { claimId: string; pluginId: string; userId: string },
) {
  await db.batch([
    db
      .update(pluginClaims)
      .set({ status: "verified", verifiedAt: new Date() })
      .where(eq(pluginClaims.id, input.claimId)),
    db
      .insert(pluginMaintainers)
      .values({
        pluginId: input.pluginId,
        userId: input.userId,
        role: "owner",
        source: "claim",
        claimId: input.claimId,
      })
      .onConflictDoUpdate({
        target: [pluginMaintainers.pluginId, pluginMaintainers.userId],
        set: { revokedAt: null, source: "claim", claimId: input.claimId },
      }),
  ]);
}
