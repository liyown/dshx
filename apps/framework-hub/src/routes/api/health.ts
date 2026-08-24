import { sql } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";

import { DatabaseUnavailableError, requireDatabase } from "@/lib/db/client";
import { requireBindings } from "@/lib/db/context";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ context }) => {
        try {
          const db = requireDatabase(context);
          const bindings = requireBindings(context);
          const tables = await db.all<{ name: string }>(sql`
            select name from sqlite_master
            where type='table' and name in ('plugins','plugin_localizations','approval_requests','user_profiles')
          `);
          const migration = await db.get<{ name: string }>(sql`
            select name from d1_migrations order by id desc limit 1
          `);
          const requiredTables = new Set(tables.map((entry) => entry.name));
          const databaseReady = [
            "plugins",
            "plugin_localizations",
            "approval_requests",
            "user_profiles",
          ].every((name) => requiredTables.has(name));
          const r2Ready = Boolean(bindings.PLUGIN_MEDIA);
          if (bindings.PLUGIN_MEDIA) await bindings.PLUGIN_MEDIA.list({ limit: 1 });
          const status = databaseReady && r2Ready ? "ok" : "degraded";

          return Response.json(
            {
              status,
              database: "cloudflare-d1",
              orm: "drizzle",
              migration: migration?.name ?? null,
              requiredTables: databaseReady ? "ready" : "missing",
              media: r2Ready ? "ready" : "missing",
            },
            { status: status === "ok" ? 200 : 503 },
          );
        } catch (error) {
          if (error instanceof DatabaseUnavailableError) {
            return Response.json(
              {
                status: "unavailable",
                database: "cloudflare-d1",
                orm: "drizzle",
                message: error.message,
              },
              { status: 503 },
            );
          }

          console.error(error);
          return Response.json(
            {
              status: "error",
              database: "cloudflare-d1",
              orm: "drizzle",
            },
            { status: 503 },
          );
        }
      },
    },
  },
});
