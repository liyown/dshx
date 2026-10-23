import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

import { PublicPageHeader } from "@/components/community/public-list";
import { Chip, Container } from "@/components/dshx/primitives";
import { loadChangelog } from "@/lib/changelog.functions";
import { buildChangelogListHead } from "@/lib/changelog-seo";
import { createTranslator, formatDate, parseLocale } from "@/lib/i18n";

export const Route = createFileRoute("/$locale/changelog/")({
  loader: () => loadChangelog(),
  head: ({ params, loaderData }) =>
    buildChangelogListHead(parseLocale(params.locale), loaderData ?? []),
  component: ChangelogPage,
});

function ChangelogPage() {
  const locale = parseLocale(Route.useParams().locale);
  const t = createTranslator(locale);
  const changelogEntries = Route.useLoaderData();

  return (
    <main>
      <Container className="py-16 md:py-24">
        <PublicPageHeader
          eyebrow={t("changelog.eyebrow")}
          title={t("changelog.title")}
          description={t("changelog.description")}
        />

        {changelogEntries.length === 0 ? (
          <p className="py-12 text-sm text-muted-foreground">{t("changelog.empty")}</p>
        ) : null}
        <ol className="divide-y divide-border">
          {changelogEntries.map((entry, index) => (
            <li key={entry.slug}>
              <article className="grid gap-6 py-10 md:grid-cols-[180px_minmax(0,1fr)] md:gap-12 md:py-12">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3 md:flex-col md:items-start">
                  <time dateTime={entry.publishedAt} className="text-[13px] text-muted-foreground">
                    {formatDate(entry.publishedAt, locale, "long")}
                  </time>
                  <span className="font-mono text-[12px]">v{entry.version}</span>
                  {index === 0 ? (
                    <span className="text-[12px] text-accent">{t("changelog.latest")}</span>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {entry.product}
                    </span>
                    <Chip tone={entry.channel === "preview" ? "accent" : "neutral"}>
                      {t(`changelog.${entry.channel}`)}
                    </Chip>
                  </div>
                  <h2 className="max-w-3xl text-balance text-[clamp(1.5rem,3vw,2rem)] font-medium leading-snug tracking-[-0.025em]">
                    <Link
                      to="/$locale/changelog/$slug"
                      params={{ locale, slug: entry.slug }}
                      className="rounded-sm transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                    >
                      {entry.copy[locale].title}
                    </Link>
                  </h2>
                  <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">
                    {entry.copy[locale].description}
                  </p>
                  <Link
                    to="/$locale/changelog/$slug"
                    params={{ locale, slug: entry.slug }}
                    aria-label={`${t("changelog.read")}: ${entry.copy[locale].title}`}
                    className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-sm text-[13px] font-medium text-accent transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                  >
                    {t("changelog.read")}
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ol>
      </Container>
    </main>
  );
}
