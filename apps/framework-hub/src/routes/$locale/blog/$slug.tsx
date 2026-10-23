import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { PluginCard } from "@/components/dshx/plugin-card";
import { Container } from "@/components/dshx/primitives";
import type { BlogBlock } from "@/lib/blog.contracts";
import { blogSlugSchema } from "@/lib/blog.contracts";
import { loadBlogDetail } from "@/lib/blog.functions";
import { createTranslator, formatDate, parseLocale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import {
  article,
  breadcrumbs,
  buildPageHead,
  DEFAULT_SOCIAL_IMAGE,
  localePath,
  localizedAlternates,
  organization,
  pageTitle,
} from "@/lib/seo";

export const Route = createFileRoute("/$locale/blog/$slug")({
  loader: async ({ params }) => {
    if (!blogSlugSchema.safeParse(params.slug).success) throw notFound();
    const detail = await loadBlogDetail({
      data: { slug: params.slug, locale: parseLocale(params.locale) },
    });
    if (!detail) throw notFound();
    return detail;
  },
  head: ({ params, loaderData }) => {
    const locale = parseLocale(params.locale);
    const t = createTranslator(locale);
    const post = loaderData?.post;
    if (!post) {
      return buildPageHead({
        locale,
        path: `/${locale}/blog/${encodeURIComponent(params.slug)}`,
        title: pageTitle(t("blog.notFound")),
        description: t("blog.notFoundDescription"),
        robots: "noindex,follow",
        image: false,
      });
    }
    const copy = post.copy[locale];
    const to = `/blog/${post.slug}`;
    const modified = post.updatedAt;
    return buildPageHead({
      locale,
      path: localePath(locale, to),
      title: pageTitle(copy.title),
      description: copy.description,
      type: "article",
      alternates: localizedAlternates(to),
      image: post.coverImageUrl
        ? { url: post.coverImageUrl, alt: copy.title }
        : { url: DEFAULT_SOCIAL_IMAGE, alt: copy.title, width: 1672, height: 941 },
      article: { published: post.publishedAt, modified, section: t("blog.title") },
      structuredData: [
        organization(),
        article({
          locale,
          to,
          type: "BlogPosting",
          headline: copy.title,
          description: copy.description,
          published: post.publishedAt,
          modified,
          image: [post.coverImageUrl ?? DEFAULT_SOCIAL_IMAGE],
          partOf: "/blog",
        }),
        breadcrumbs(locale, [
          { name: t("blog.title"), to: "/blog" },
          { name: copy.title, to },
        ]),
      ],
    });
  },
  component: BlogArticlePage,
  notFoundComponent: BlogNotFound,
});

function BlogNotFound() {
  const { locale } = useI18n();
  const t = createTranslator(locale);
  return (
    <main>
      <Container className="py-24 md:py-32">
        <p className="font-mono text-sm text-accent">404</p>
        <h1 className="mt-4 text-3xl font-medium tracking-tight">{t("blog.notFound")}</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-muted-foreground">
          {t("blog.notFoundDescription")}
        </p>
        <Link
          to="/$locale/blog"
          params={{ locale }}
          className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-sm text-sm text-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("blog.back")}
        </Link>
      </Container>
    </main>
  );
}

function BlogBlockView({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="whitespace-pre-wrap text-[15px] leading-8 text-muted-foreground">
          {block.text}
        </p>
      );
    case "list":
      return (
        <ul className="list-disc space-y-3 pl-5 text-[15px] leading-8 text-muted-foreground marker:text-accent">
          {block.items.map((item) => (
            <li key={item} className="pl-1">
              {item}
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-accent/40 pl-5 text-[15px] leading-8 text-muted-foreground">
          <p className="whitespace-pre-wrap">{block.text}</p>
        </blockquote>
      );
    case "code":
      return (
        <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
          {block.language ? (
            <div className="border-b border-border px-4 py-2 font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground">
              {block.language}
            </div>
          ) : null}
          <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-6">
            <code>{block.code}</code>
          </pre>
        </div>
      );
    case "image":
      return (
        <figure className="overflow-hidden rounded-lg border border-border bg-surface-2">
          <img
            src={block.url}
            alt={block.alt}
            width={block.width}
            height={block.height}
            loading="lazy"
            decoding="async"
            className="block h-auto w-full"
          />
          {block.caption ? (
            <figcaption className="border-t border-border px-4 py-2.5 text-[12px] leading-5 text-muted-foreground">
              {block.caption}
            </figcaption>
          ) : null}
        </figure>
      );
  }
}

function BlogArticlePage() {
  const locale = parseLocale(Route.useParams().locale);
  const { post, content, related, newer, older } = Route.useLoaderData();
  const t = createTranslator(locale);
  const article = post.copy[locale];

  return (
    <main>
      <Container className="py-10 md:py-16">
        <nav aria-label={t("blog.title")}>
          <Link
            to="/$locale/blog"
            params={{ locale }}
            className="inline-flex min-h-10 items-center gap-2 rounded-sm text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("blog.back")}
          </Link>
        </nav>

        <article className="mt-8 md:mt-12">
          <header className="border-b border-border pb-10 md:pb-12">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
              {t("blog.eyebrow")}
            </p>
            <h1 className="mt-5 max-w-4xl text-balance text-[clamp(2rem,4.5vw,3.5rem)] font-medium leading-[1.15] tracking-[-0.04em]">
              {article.title}
            </h1>
            <p className="mt-6 max-w-3xl text-[16px] leading-8 text-muted-foreground">
              {article.description}
            </p>
            <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4 text-[12px]">
              <div>
                <dt className="text-muted-foreground">{t("blog.published")}</dt>
                <dd className="mt-1.5">
                  <time dateTime={post.publishedAt}>
                    {formatDate(post.publishedAt, locale, "long")}
                  </time>
                </dd>
              </div>
              {post.updatedAt.slice(0, 10) !== post.publishedAt ? (
                <div>
                  <dt className="text-muted-foreground">{t("blog.updated")}</dt>
                  <dd className="mt-1.5">
                    <time dateTime={post.updatedAt}>
                      {formatDate(post.updatedAt, locale, "long")}
                    </time>
                  </dd>
                </div>
              ) : null}
            </dl>
            {post.coverImageUrl ? (
              <img
                src={post.coverImageUrl}
                alt=""
                loading="eager"
                decoding="async"
                className="mt-10 aspect-[16/8] w-full rounded-xl border border-border object-cover"
              />
            ) : null}
          </header>

          <div className="grid gap-12 pt-10 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-20 lg:pt-14">
            <div className="min-w-0 max-w-3xl space-y-10">
              {content.sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <h2 className="mb-4 text-[21px] font-medium tracking-[-0.02em]">
                    {section.title}
                  </h2>
                  <div className="space-y-4">
                    {section.blocks.map((block, index) => (
                      <BlogBlockView key={`${section.id}-${index}`} block={block} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <aside className="hidden lg:block">
              <nav
                aria-label={t("blog.onThisPage")}
                className="sticky top-24 border-l border-border pl-6"
              >
                <p className="mb-4 font-mono text-[11px] text-muted-foreground">
                  {t("blog.onThisPage")}
                </p>
                <ul className="space-y-4">
                  {content.sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="text-[12.5px] leading-6 text-muted-foreground hover:text-foreground"
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>
          </div>
        </article>

        {related.length > 0 ? (
          <section className="mt-16 border-t border-border pt-10" aria-labelledby="related-plugins">
            <div className="mb-6">
              <h2 id="related-plugins" className="text-[18px] font-medium">
                {t("blog.relatedPlugins")}
              </h2>
              <p className="mt-2 text-[13px] text-muted-foreground">
                {t("blog.relatedPluginsDescription")}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((plugin) => (
                <PluginCard key={plugin.slug} plugin={plugin} />
              ))}
            </div>
          </section>
        ) : null}

        <nav
          aria-label={t("blog.navigation")}
          className="mt-16 grid gap-8 border-t border-border pt-8 sm:grid-cols-2"
        >
          {newer ? (
            <Link
              to="/$locale/blog/$slug"
              params={{ locale, slug: newer.slug }}
              className="group rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                {t("blog.newer")}
              </span>
              <span className="mt-3 block text-[15px] leading-6 group-hover:text-accent">
                {newer.copy[locale].title}
              </span>
            </Link>
          ) : (
            <div />
          )}
          {older ? (
            <Link
              to="/$locale/blog/$slug"
              params={{ locale, slug: older.slug }}
              className="group rounded-sm sm:text-right focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <span className="flex items-center gap-2 text-[12px] text-muted-foreground sm:justify-end">
                {t("blog.older")}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </span>
              <span className="mt-3 block text-[15px] leading-6 group-hover:text-accent">
                {older.copy[locale].title}
              </span>
            </Link>
          ) : null}
        </nav>
      </Container>
    </main>
  );
}
