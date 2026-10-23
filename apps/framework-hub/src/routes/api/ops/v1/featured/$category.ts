import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { replaceFeaturedPicksSchema } from "@/lib/blog.contracts";
import { writeFeaturedPicks } from "@/lib/featured.application.server";

const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/ops/v1/featured/$category")({
  server: {
    handlers: {
      PUT: tokenRoute(
        { envelope: "operation", body: replaceFeaturedPicksSchema, status: 200, headers: noStore },
        ({ db, params, input }) => writeFeaturedPicks(db, params.category, input.pluginSlugs),
      ),
    },
  },
});
