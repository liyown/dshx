import { createFileRoute } from "@tanstack/react-router";

import { DatabaseUnavailableError, requireDatabase } from "@/lib/db/client";
import { requireBindings } from "@/lib/db/context";
import { inspectDatabaseHealth } from "@/lib/health.application.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ context }) => {
        try {
          const db = requireDatabase(context);
          const bindings = requireBindings(context);
          const database = await inspectDatabaseHealth(db);
          const r2Ready = Boolean(bindings.PLUGIN_MEDIA);
          if (bindings.PLUGIN_MEDIA) await bindings.PLUGIN_MEDIA.list({ limit: 1 });
          const status = database.ready && r2Ready ? "ok" : "degraded";

          return Response.json(
            {
              status,
              database: "cloudflare-d1",
              orm: "drizzle",
              migration: database.migration,
              requiredTables: database.ready ? "ready" : "missing",
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
