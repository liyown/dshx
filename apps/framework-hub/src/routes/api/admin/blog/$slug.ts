import { createFileRoute } from "@tanstack/react-router";

import { adminRoute } from "@/lib/api/route";
import { readAdminBlogArticle, updateAdminBlogArticle } from "@/lib/blog.application.server";
import { blogAdminArticleSchema, updateBlogPostSchema } from "@/lib/blog.contracts";
import { invalidateBlogSitemap } from "@/lib/sitemap-invalidation.server";

const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/admin/blog/$slug")({
  server: {
    handlers: {
      GET: adminRoute({ headers: noStore, response: blogAdminArticleSchema }, ({ db, params }) =>
        readAdminBlogArticle(db, params.slug),
      ),
      PUT: adminRoute(
        { body: updateBlogPostSchema, headers: noStore, response: blogAdminArticleSchema },
        async ({ request, db, params, input }) => {
          const article = await updateAdminBlogArticle(db, params.slug, input);
          invalidateBlogSitemap(request);
          return article;
        },
      ),
    },
  },
});
