import { createFileRoute } from "@tanstack/react-router";

import { adminRoute } from "@/lib/api/route";
import { createAdminBlogArticle, listBlogArticles } from "@/lib/blog.application.server";
import {
  blogAdminArticleSchema,
  blogAdminListSchema,
  createBlogPostSchema,
} from "@/lib/blog.contracts";
import { invalidateBlogSitemap } from "@/lib/sitemap-invalidation.server";

const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/admin/blog/")({
  server: {
    handlers: {
      GET: adminRoute({ headers: noStore, response: blogAdminListSchema }, ({ db }) =>
        listBlogArticles(db),
      ),
      POST: adminRoute(
        {
          body: createBlogPostSchema,
          status: 201,
          headers: noStore,
          response: blogAdminArticleSchema,
        },
        async ({ request, db, input }) => {
          const article = await createAdminBlogArticle(db, input);
          invalidateBlogSitemap(request);
          return article;
        },
      ),
    },
  },
});
