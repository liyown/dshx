import { createFileRoute } from "@tanstack/react-router";

import { adminBlogError, createBlogForAdmin, listBlogForAdmin } from "@/lib/blog-admin.server";

export const Route = createFileRoute("/api/admin/blog/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          return Response.json(await listBlogForAdmin(request, context), {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return adminBlogError(error);
        }
      },
      POST: async ({ request, context }) => {
        try {
          const post = await createBlogForAdmin(request, context);
          return Response.json(post, {
            status: 201,
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return adminBlogError(error);
        }
      },
    },
  },
});
