import { and, eq, gt } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { cliAuthorizations } from "@/lib/db/schema";

export type CliAuthorizationInsert = typeof cliAuthorizations.$inferInsert;

export async function insertCliAuthorization(db: Database, value: CliAuthorizationInsert) {
  await db.insert(cliAuthorizations).values(value);
}

export async function findPendingCliAuthorization(db: Database, id: string) {
  const [authorization] = await db
    .select()
    .from(cliAuthorizations)
    .where(
      and(
        eq(cliAuthorizations.id, id),
        eq(cliAuthorizations.status, "pending"),
        gt(cliAuthorizations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return authorization ?? null;
}

export async function approveCliAuthorization(
  db: Database,
  input: { id: string; userId: string; exchangeCodeHash: string },
) {
  await db
    .update(cliAuthorizations)
    .set({
      status: "approved",
      approvedByUserId: input.userId,
      exchangeCodeHash: input.exchangeCodeHash,
      approvedAt: new Date(),
    })
    .where(eq(cliAuthorizations.id, input.id));
}
