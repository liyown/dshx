import { createFileRoute } from "@tanstack/react-router";

import { v1ContentOperations } from "@/lib/api/operations/v1-content";
import { listChangelogEntries, writeChangelogEntry } from "@/lib/changelog.application.server";
import { invalidateChangelogSitemap } from "@/lib/sitemap-invalidation.server";

export const Route = createFileRoute("/api/ops/v1/changelog/")({
  server: {
    handlers: {
      GET: v1ContentOperations.listChangelogEntries.route(({ db }) => listChangelogEntries(db)),
      POST: v1ContentOperations.createChangelogEntry.route(
        async ({ request, db, token, input }) => {
          const entry = await writeChangelogEntry(db, token.id, input);
          invalidateChangelogSitemap(request);
          return entry;
        },
      ),
    },
  },
});
