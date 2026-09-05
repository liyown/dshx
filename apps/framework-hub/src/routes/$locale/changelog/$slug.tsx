import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";

import { Chip, Container } from "@/components/dshx/primitives";
import { changelogCopy, formatChangelogDate } from "@/lib/changelog";
import { loadChangelogDetail } from "@/lib/changelog.functions";
import { changelogSlugSchema } from "@/lib/changelog.contracts";
import { buildChangelogArticleHead } from "@/lib/changelog-seo";
import { parseLocale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/$locale/changelog/$slug")({
  loader: async ({ params }) => {
    if (!changelogSlugSchema.safeParse(params.slug).success) throw notFound();
    const detail = await loadChangelogDetail({
      data: { slug: params.slug, locale: parseLocale(params.locale) },
    });
    if (!detail) throw notFound();
    return detail;
  },
  head: ({ params, loaderData }) => {
    const locale = parseLocale(params.locale);
    const entry = loaderData?.entry;
    if (entry) return buildChangelogArticleHead(locale, entry);
    return buildSeoHead({
      locale,
      path: `/${locale}/changelog/${encodeURIComponent(params.slug)}`,
      title: `${changelogCopy[locale].notFound} · DSHX`,
      description: changelogCopy[locale].notFoundDescription,
      robots: "noindex,follow",
      image: false,
    });
  },
  component: ChangelogArticlePage,
  notFoundComponent: ChangelogNotFound,
});

function ChangelogNotFound() {
  const { locale } = useI18n();
  const copy = changelogCopy[locale];
  return (
    <main>
      <Container className="py-24 md:py-32">
        <p className="font-mono text-sm text-accent">404</p>
        <h1 className="mt-4 text-3xl font-medium tracking-tight">{copy.notFound}</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-muted-foreground">
          {copy.notFoundDescription}
        </p>
        <Link
          to="/$locale/changelog"
          params={{ locale }}
          className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-sm text-sm text-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {copy.back}
        </Link>
      </Container>
    </main>
  );
}

function ChangelogArticlePage() {
  const locale = parseLocale(Route.useParams().locale);
  const { entry, content, newer, older } = Route.useLoaderData();
  const copy = changelogCopy[locale];
  const article = entry.copy[locale];

  return (
    <main>
      <Container className="py-10 md:py-16">
        <nav aria-label={copy.title}>
          <Link
            to="/$locale/changelog"
            params={{ locale }}
            className="inline-flex min-h-10 items-center gap-2 rounded-sm text-[13px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {copy.back}
          </Link>
        </nav>

        <article className="mt-8 md:mt-12">
          <header className="border-b border-border pb-10 md:pb-12">
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <span className="font-mono text-[12px] text-muted-foreground">{entry.product}</span>
              <Chip tone={entry.channel === "preview" ? "accent" : "neutral"}>
                {copy[entry.channel]}
              </Chip>
            </div>
            <h1 className="max-w-4xl text-balance text-[clamp(2rem,4.5vw,3.5rem)] font-medium leading-[1.2] tracking-[-0.04em]">
              {article.title}
            </h1>
            <p className="mt-6 max-w-3xl text-[16px] leading-8 text-muted-foreground">
              {article.description}
            </p>
            <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4 text-[12px]">
              <div>
                <dt className="text-muted-foreground">{copy.published}</dt>
                <dd className="mt-1.5">
                  <time dateTime={entry.publishedAt}>
                    {formatChangelogDate(entry.publishedAt, locale)}
                  </time>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{copy.version}</dt>
                <dd className="mt-1.5 font-mono">{entry.version}</dd>
              </div>
              {entry.updatedAt && entry.updatedAt.slice(0, 10) !== entry.publishedAt ? (
                <div>
                  <dt className="text-muted-foreground">{copy.updated}</dt>
                  <dd className="mt-1.5">
                    <time dateTime={entry.updatedAt}>
                      {formatChangelogDate(entry.updatedAt, locale)}
                    </time>
                  </dd>
                </div>
              ) : null}
            </dl>
          </header>

          <div className="grid gap-12 pt-10 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-20 lg:pt-14">
            <div className="min-w-0 max-w-3xl space-y-10">
              {content.sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <h2 className="mb-4 text-[21px] font-medium tracking-[-0.02em]">
                    {section.title}
                  </h2>
                  <div className="space-y-4 text-[15px] leading-8 text-muted-foreground">
                    {section.paragraphs?.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {section.items ? (
                      <ul className="list-disc space-y-3 pl-5 marker:text-accent">
                        {section.items.map((item) => (
                          <li key={item} className="pl-1">
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </section>
              ))}
              <section className="border-t border-border pt-8" aria-labelledby="release-links">
                <h2 id="release-links" className="mb-4 text-[15px] font-medium">
                  {copy.sources}
                </h2>
                <ul className="space-y-3">
                  {content.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className="inline-flex min-h-10 items-center gap-2 rounded-sm text-[13px] text-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                      >
                        {link.label}
                        <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
            <aside className="hidden lg:block">
              <nav
                aria-label={copy.onThisPage}
                className="sticky top-24 border-l border-border pl-6"
              >
                <p className="mb-4 font-mono text-[11px] text-muted-foreground">
                  {copy.onThisPage}
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

        <nav
          aria-label={copy.navigation}
          className="mt-16 grid gap-8 border-t border-border pt-8 sm:grid-cols-2"
        >
          {newer ? (
            <Link
              to="/$locale/changelog/$slug"
              params={{ locale, slug: newer.slug }}
              className="group rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                {copy.newer}
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
              to="/$locale/changelog/$slug"
              params={{ locale, slug: older.slug }}
              className="group rounded-sm sm:text-right focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              <span className="flex items-center gap-2 text-[12px] text-muted-foreground sm:justify-end">
                {copy.older}
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
