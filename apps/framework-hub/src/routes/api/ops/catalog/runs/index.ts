import { desc, eq } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { syncRunCreateSchema } from "@/lib/catalog/contracts";
import { requireDatabase } from "@/lib/db/client";
import { catalogSyncRuns } from "@/lib/db/schema";
import { HttpError, jsonError, readJson, uuid } from "@/lib/http";

export const Route = createFileRoute("/api/ops/catalog/runs/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          const status = new URL(request.url).searchParams.get("status");
          const query = db
            .select()
            .from(catalogSyncRuns)
            .orderBy(desc(catalogSyncRuns.startedAt))
            .limit(20);
          const runs =
            status === "open" ? await query.where(eq(catalogSyncRuns.status, "open")) : await query;
          return Response.json({ items: runs });
        } catch (error) {
          return jsonError(error);
        }
      },
      POST: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          const actor = await requireApiToken(db, request, "catalog:write");
          const input = await readJson(request, syncRunCreateSchema);
          const [existing] = await db
            .select()
            .from(catalogSyncRuns)
            .where(eq(catalogSyncRuns.idempotencyKey, input.idempotencyKey))
            .limit(1);
          if (existing) {
            if (
              existing.mode !== input.mode ||
              existing.expectedItems !== input.expectedItems ||
              existing.schemaVersion !== input.schemaVersion
            )
              throw new HttpError(
                409,
                "Idempotency key belongs to a different catalog run request",
                "idempotency_conflict",
              );
            return Response.json(existing);
          }
          const id = uuid();
          await db.insert(catalogSyncRuns).values({
            id,
            mode: input.mode,
            schemaVersion: input.schemaVersion,
            idempotencyKey: input.idempotencyKey,
            expectedItems: input.expectedItems,
            cliVersion: input.cliVersion,
            checkerVersion: input.checkerVersion,
            cursorJson: input.cursor,
            actorTokenId: actor.token.id,
          });
          const [run] = await db
            .select()
            .from(catalogSyncRuns)
            .where(eq(catalogSyncRuns.id, id))
            .limit(1);
          return Response.json(run, { status: 201 });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
