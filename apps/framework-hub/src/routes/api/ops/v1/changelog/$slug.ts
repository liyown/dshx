import { createFileRoute } from "@tanstack/react-router";

import { v1ContentOperations } from "@/lib/api/operations/v1-content";
import { editChangelogEntry, readChangelogEntry } from "@/lib/changelog.application.server";
import { invalidateChangelogSitemap } from "@/lib/sitemap-invalidation.server";

export const Route = createFileRoute("/api/ops/v1/changelog/$slug")({
  server: {
    handlers: {
      GET: v1ContentOperations.getChangelogEntry.route(({ db, params }) =>
        readChangelogEntry(db, params.slug),
      ),
      PUT: v1ContentOperations.updateChangelogEntry.route(
        async ({ request, db, token, params, input }) => {
          const entry = await editChangelogEntry(db, token.id, params.slug, input);
          invalidateChangelogSitemap(request);
          return entry;
        },
      ),
    },
  },
});
