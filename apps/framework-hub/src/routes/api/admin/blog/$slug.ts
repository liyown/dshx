import { createFileRoute } from "@tanstack/react-router";

import { adminBlogError, getBlogForAdmin, updateBlogForAdmin } from "@/lib/blog-admin.server";

export const Route = createFileRoute("/api/admin/blog/$slug")({
  server: {
    handlers: {
      GET: async ({ request, context, params }) => {
        try {
          return Response.json(await getBlogForAdmin(request, context, params.slug), {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return adminBlogError(error);
        }
      },
      PUT: async ({ request, context, params }) => {
        try {
          return Response.json(await updateBlogForAdmin(request, context, params.slug), {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return adminBlogError(error);
        }
      },
    },
  },
});
