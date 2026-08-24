import { createFileRoute } from "@tanstack/react-router";

import { requireBindings } from "@/lib/db/context";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request, context }) => {
        const site = (requireBindings(context).SITE_URL ?? new URL(request.url).origin).replace(
          /\/$/,
          "",
        );
        return new Response(
          `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/admin/\nDisallow: /api/ops/\nDisallow: /api/cli/\nSitemap: ${site}/sitemap.xml\n`,
          {
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "cache-control": "public, max-age=86400",
            },
          },
        );
      },
    },
  },
});
