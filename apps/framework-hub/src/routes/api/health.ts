import { createFileRoute } from "@tanstack/react-router";

import { catalogOperations } from "@/lib/api/operations/catalog";
import { requireBindings } from "@/lib/db/context";
import { inspectDatabaseHealth } from "@/lib/health.application.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      /**
       * A probe answers its own bodies, including the 503 ones, so this handler
       * returns Response objects instead of the endpoint's JSON envelope.
       *
       * The declaration's route requires the database before the handler runs, so
       * a deployment without a D1 binding is answered there, not here; what is
       * left to probe is the query behind it and the media bucket beside it.
       */
      GET: catalogOperations.getHubHealth.route(async ({ context, db }) => {
        try {
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
      }),
    },
  },
});
