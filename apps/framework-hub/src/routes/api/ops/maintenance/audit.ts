import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { maintenanceAuditQuerySchema } from "@/lib/catalog/contracts";
import { auditMaintenance } from "@/lib/catalog/operations.server";
import { requireBindings } from "@/lib/db/context";
import { requireDatabase } from "@/lib/db/client";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/ops/maintenance/audit")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          const query = maintenanceAuditQuerySchema.parse({
            scope: new URL(request.url).searchParams.get("scope") ?? undefined,
          });
          return Response.json(
            await auditMaintenance(db, requireBindings(context).PLUGIN_MEDIA, query.scope),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
