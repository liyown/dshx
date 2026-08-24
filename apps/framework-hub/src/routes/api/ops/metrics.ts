import { createFileRoute } from "@tanstack/react-router";

import { requireApiToken } from "@/lib/auth/tokens.server";
import { metricObservationPageV2Schema } from "@/lib/catalog/contracts";
import { storeMetricSnapshots } from "@/lib/catalog/operations.server";
import { requireD1, requireDatabase } from "@/lib/db/client";
import { jsonError, readJson } from "@/lib/http";

export const Route = createFileRoute("/api/ops/metrics")({
  server: {
    handlers: {
      PUT: async ({ request, context }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          const input = await readJson(request, metricObservationPageV2Schema);
          return Response.json(
            await storeMetricSnapshots(
              requireD1(context),
              db,
              input.observations.map((observation) => observation.metrics),
            ),
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
