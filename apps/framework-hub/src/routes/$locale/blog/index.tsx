import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { PublicPageHeader } from "@/components/community/public-list";
import { Container } from "@/components/dshx/primitives";
import { blogCopy } from "@/lib/blog";
import { buildBlogListHead } from "@/lib/blog-seo";
import { loadBlog } from "@/lib/blog.functions";
import { formatDate, parseLocale } from "@/lib/i18n";

export const Route = createFileRoute("/$locale/blog/")({
  loader: () => loadBlog(),
  head: ({ params, loaderData }) => buildBlogListHead(parseLocale(params.locale), loaderData ?? []),
  component: BlogIndexPage,
});

function BlogIndexPage() {
  const locale = parseLocale(Route.useParams().locale);
  const copy = blogCopy[locale];
  const posts = Route.useLoaderData();

  return (
    <main>
      <Container className="py-16 md:py-24">
        <PublicPageHeader
          eyebrow={copy.eyebrow}
          title={copy.title}
          description={copy.description}
        />

        {posts.length === 0 ? (
          <p className="py-12 text-sm text-muted-foreground">{copy.empty}</p>
        ) : (
          <ol className="divide-y divide-border">
            {posts.map((post, index) => (
              <li key={post.slug}>
                <article className="grid gap-6 py-10 md:grid-cols-[180px_minmax(0,1fr)] md:gap-12 md:py-12">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3 md:flex-col md:items-start">
                    <time dateTime={post.publishedAt} className="text-[13px] text-muted-foreground">
                      {formatDate(post.publishedAt, locale, "long")}
                    </time>
                    {index === 0 ? (
                      <span className="text-[12px] text-accent">{copy.latest}</span>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <h2 className="max-w-3xl text-balance text-[clamp(1.5rem,3vw,2rem)] font-medium leading-snug tracking-[-0.025em]">
                      <Link
                        to="/$locale/blog/$slug"
                        params={{ locale, slug: post.slug }}
                        className="rounded-sm transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                      >
                        {post.copy[locale].title}
                      </Link>
                    </h2>
                    <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">
                      {post.copy[locale].description}
                    </p>
                    <Link
                      to="/$locale/blog/$slug"
                      params={{ locale, slug: post.slug }}
                      aria-label={`${copy.read}: ${post.copy[locale].title}`}
                      className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-sm text-[13px] font-medium text-accent transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                    >
                      {copy.read}
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        )}
      </Container>
    </main>
  );
}
