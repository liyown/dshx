import { createFileRoute } from "@tanstack/react-router";

import { PUBLIC_SITE_URL } from "@/lib/seo";

export function robotsResponse(): Response {
  return new Response(
    `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/admin/\nDisallow: /api/ops/\nDisallow: /api/cli/\nSitemap: ${PUBLIC_SITE_URL}/sitemap.xml\n`,
    {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=86400",
      },
    },
  );
}

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => robotsResponse(),
    },
  },
});
