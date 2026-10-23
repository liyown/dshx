import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { AdminHeader } from "@/components/admin/approval-ui";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/api-client";
import { blogAdminListSchema } from "@/lib/blog.contracts";
import { hasAdminAccess } from "@/lib/auth/functions";
import { formatDate } from "@/lib/i18n";

export const Route = createFileRoute("/admin/blog/")({
  loader: async () => {
    if (!(await hasAdminAccess()))
      throw redirect({ to: "/$locale/account", params: { locale: "en" } });
  },
  head: () => ({
    meta: [{ title: "Blog · DSHX Hub" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: BlogAdminPage,
});

function BlogAdminPage() {
  const query = useQuery({
    queryKey: ["admin", "blog"],
    queryFn: ({ signal }) => apiRequest("/api/admin/blog", blogAdminListSchema, { signal }),
  });

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader title="Blog" />
      <main className="mx-auto max-w-[1200px] px-5 py-10 lg:px-8">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-8 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">Editorial</p>
            <h1 className="mt-3 text-3xl font-medium tracking-tight">Blog articles</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Bilingual posts stored in D1. Publishing and withdrawal are immediate; no rebuild is
              required.
            </p>
          </div>
          <Button asChild>
            <Link to="/admin/blog/new">New article</Link>
          </Button>
        </div>

        {query.isError ? (
          <p className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {query.error instanceof Error ? query.error.message : "Articles could not be loaded."}
          </p>
        ) : null}

        <div className="mt-8 overflow-x-auto border-y border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Article</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Revision</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(query.data?.items ?? []).map((post) => (
                <TableRow key={post.slug}>
                  <TableCell className="min-w-64">
                    <div className="font-medium">{post.copy.en.title}</div>
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      {post.copy.zh.title}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-muted-foreground">
                    {post.slug}
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        post.status === "published"
                          ? "font-mono text-[11px] uppercase text-accent"
                          : "font-mono text-[11px] uppercase text-muted-foreground"
                      }
                    >
                      {post.status}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
                    {formatDate(post.publishedAt, "en", "long")}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-muted-foreground">
                    {post.revision}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to="/admin/blog/$slug"
                      params={{ slug: post.slug }}
                      className="text-sm text-accent hover:text-foreground"
                    >
                      Edit
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {query.isSuccess && query.data.items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No articles yet. Create the first bilingual post.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <p className="mt-6 text-[12px] text-muted-foreground">
          Programmatic authors can use <code className="font-mono">/api/ops/v1/blog</code> with a
          <code className="font-mono"> catalog:write</code> bearer token.
        </p>
      </main>
    </div>
  );
}
