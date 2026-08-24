import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { requireApiToken } from "@/lib/auth/tokens.server";
import {
  capabilityKinds,
  catalogProposalV2Schema,
  mediaUploadMetadataV2Schema,
  metricObservationV2Schema,
  moderationActionSchema,
  targetObservationV2Schema,
} from "@/lib/catalog/contracts";
import { requireDatabase } from "@/lib/db/client";
import { HttpError, jsonError } from "@/lib/http";

const contracts = {
  catalog: { version: 2, schema: catalogProposalV2Schema },
  metrics: { version: 2, schema: metricObservationV2Schema },
  target: { version: 2, schema: targetObservationV2Schema },
  media: { version: 2, schema: mediaUploadMetadataV2Schema },
  moderation: { version: 1, schema: moderationActionSchema },
} as const;

export const Route = createFileRoute("/api/ops/contracts/$kind")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          const db = requireDatabase(context);
          await requireApiToken(db, request, "catalog:write");
          const kind = params.kind as keyof typeof contracts;
          const contract = contracts[kind];
          if (!contract)
            throw new HttpError(404, "Operations contract not found", "contract_not_found");
          const categories =
            kind === "catalog"
              ? await db.all<{ slug: string; sort_order: number }>(
                  sql`select slug,sort_order from categories order by sort_order`,
                )
              : [];
          return Response.json({
            kind,
            version: contract.version,
            schema: z.toJSONSchema(contract.schema),
            policy: {
              ...(kind === "catalog"
                ? {
                    categories: categories.map((category) => category.slug),
                    capabilityKinds,
                    contentSourceHash:
                      "sha256 of sorted content source URL, NUL, and sha256 pairs joined by newline",
                  }
                : {}),
              maxPageSize: kind === "catalog" || kind === "metrics" || kind === "target" ? 100 : 1,
            },
          });
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
