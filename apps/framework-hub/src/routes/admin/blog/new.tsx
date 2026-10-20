import { createFileRoute, redirect } from "@tanstack/react-router";

import { BlogEditor } from "@/components/admin/blog-editor";
import { hasAdminAccess } from "@/lib/auth/functions";

export const Route = createFileRoute("/admin/blog/new")({
  loader: async () => {
    if (!(await hasAdminAccess()))
      throw redirect({ to: "/$locale/account", params: { locale: "en" } });
  },
  head: () => ({
    meta: [
      { title: "New blog article · DSHX Hub" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <BlogEditor />,
});
