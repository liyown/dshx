import { createFileRoute } from "@tanstack/react-router";

import { v1ContentOperations } from "@/lib/api/operations/v1-content";
import { editBlogArticle, readBlogArticle } from "@/lib/blog.application.server";
import { invalidateBlogSitemap } from "@/lib/sitemap-invalidation.server";

export const Route = createFileRoute("/api/ops/v1/blog/$slug")({
  server: {
    handlers: {
      GET: v1ContentOperations.getBlogPost.route(({ db, params }) =>
        readBlogArticle(db, params.slug),
      ),
      PUT: v1ContentOperations.updateBlogPost.route(
        async ({ request, db, token, params, input }) => {
          const article = await editBlogArticle(db, token.id, params.slug, input);
          invalidateBlogSitemap(request);
          return article;
        },
      ),
    },
  },
});
