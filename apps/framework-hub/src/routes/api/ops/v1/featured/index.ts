import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { readFeaturedPicks } from "@/lib/featured.application.server";

const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/ops/v1/featured/")({
  server: {
    handlers: {
      GET: tokenRoute({ envelope: "operation", headers: noStore }, ({ db }) =>
        readFeaturedPicks(db),
      ),
    },
  },
});
