import { createFileRoute } from "@tanstack/react-router";

import { v1ContentOperations } from "@/lib/api/operations/v1-content";
import { listBlogArticles, writeBlogArticle } from "@/lib/blog.application.server";
import { invalidateBlogSitemap } from "@/lib/sitemap-invalidation.server";

export const Route = createFileRoute("/api/ops/v1/blog/")({
  server: {
    handlers: {
      GET: v1ContentOperations.listBlogPosts.route(({ db }) => listBlogArticles(db)),
      POST: v1ContentOperations.createBlogPost.route(async ({ request, db, token, input }) => {
        const article = await writeBlogArticle(db, token.id, input);
        invalidateBlogSitemap(request);
        return article;
      }),
    },
  },
});
