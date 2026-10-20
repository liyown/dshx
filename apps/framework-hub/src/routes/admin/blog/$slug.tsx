import { createFileRoute, redirect } from "@tanstack/react-router";

import { BlogEditor } from "@/components/admin/blog-editor";
import { hasAdminAccess } from "@/lib/auth/functions";
import { blogSlugSchema } from "@/lib/blog.contracts";

export const Route = createFileRoute("/admin/blog/$slug")({
  loader: async ({ params }) => {
    if (!(await hasAdminAccess()))
      throw redirect({ to: "/$locale/account", params: { locale: "en" } });
    if (!blogSlugSchema.safeParse(params.slug).success) throw redirect({ to: "/admin/blog" });
  },
  head: () => ({
    meta: [
      { title: "Edit blog article · DSHX Hub" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: BlogArticleAdmin,
});

function BlogArticleAdmin() {
  const { slug } = Route.useParams();
  return <BlogEditor slug={slug} />;
}
