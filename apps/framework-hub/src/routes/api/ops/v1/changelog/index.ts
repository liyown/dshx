import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { listChangelogEntries, writeChangelogEntry } from "@/lib/changelog.application.server";
import { createChangelogSchema } from "@/lib/changelog.contracts";
import { invalidateChangelogSitemap } from "@/lib/sitemap-invalidation.server";

const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/ops/v1/changelog/")({
  server: {
    handlers: {
      GET: tokenRoute({ envelope: "operation", headers: noStore }, ({ db }) =>
        listChangelogEntries(db),
      ),
      POST: tokenRoute(
        { envelope: "operation", body: createChangelogSchema, status: 201, headers: noStore },
        async ({ request, db, token, input }) => {
          const entry = await writeChangelogEntry(db, token.id, input);
          invalidateChangelogSitemap(request);
          return entry;
        },
      ),
    },
  },
});
