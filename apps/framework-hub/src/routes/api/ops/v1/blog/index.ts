import { createFileRoute } from "@tanstack/react-router";

import { tokenRoute } from "@/lib/api/route";
import { listBlogArticles, writeBlogArticle } from "@/lib/blog.application.server";
import { createBlogPostSchema } from "@/lib/blog.contracts";
import { invalidateBlogSitemap } from "@/lib/sitemap-invalidation.server";

const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/ops/v1/blog/")({
  server: {
    handlers: {
      GET: tokenRoute({ envelope: "operation", headers: noStore }, ({ db }) =>
        listBlogArticles(db),
      ),
      POST: tokenRoute(
        { envelope: "operation", body: createBlogPostSchema, status: 201, headers: noStore },
        async ({ request, db, token, input }) => {
          const article = await writeBlogArticle(db, token.id, input);
          invalidateBlogSitemap(request);
          return article;
        },
      ),
    },
  },
});
