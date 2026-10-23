import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { editBlogArticle, readBlogArticle } from "@/lib/blog.application.server";
import { updateBlogPostSchema } from "@/lib/blog.contracts";
import { invalidateBlogSitemap } from "@/lib/sitemap-invalidation.server";

const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/ops/v1/blog/$slug")({
  server: {
    handlers: {
      GET: tokenRoute({ envelope: "operation", headers: noStore }, ({ db, params }) =>
        readBlogArticle(db, params.slug),
      ),
      PUT: tokenRoute(
        { envelope: "operation", body: updateBlogPostSchema, status: 200, headers: noStore },
        async ({ request, db, token, params, input }) => {
          const article = await editBlogArticle(db, token.id, params.slug, input);
          invalidateBlogSitemap(request);
          return article;
        },
      ),
    },
  },
});
