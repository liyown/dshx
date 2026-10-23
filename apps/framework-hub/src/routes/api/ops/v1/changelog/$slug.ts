import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { editChangelogEntry, readChangelogEntry } from "@/lib/changelog.application.server";
import { updateChangelogSchema } from "@/lib/changelog.contracts";
import { invalidateChangelogSitemap } from "@/lib/sitemap-invalidation.server";

const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/ops/v1/changelog/$slug")({
  server: {
    handlers: {
      GET: tokenRoute({ envelope: "operation", headers: noStore }, ({ db, params }) =>
        readChangelogEntry(db, params.slug),
      ),
      PUT: tokenRoute(
        { envelope: "operation", body: updateChangelogSchema, status: 200, headers: noStore },
        async ({ request, db, token, params, input }) => {
          const entry = await editChangelogEntry(db, token.id, params.slug, input);
          invalidateChangelogSitemap(request);
          return entry;
        },
      ),
    },
  },
});
