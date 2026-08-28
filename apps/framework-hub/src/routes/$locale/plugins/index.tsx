import { createFileRoute, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { ArrowRight, LayoutGrid, List, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { PluginCard, PluginRow } from "@/components/dshx/plugin-card";
import { Chip, Container, SectionLabel } from "@/components/dshx/primitives";
import { PluginSubmissionDialog } from "@/components/community/plugin-submission-dialog";
import { catalogSortValues, type PluginListQuery } from "@/lib/catalog/contracts";
import { loadCatalog } from "@/lib/catalog/functions";
import { createTranslator, parseLocale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { breadcrumbList, buildSeoHead, localizedAlternates, publicUrl } from "@/lib/seo";
import { cn } from "@/lib/utils";

type CatalogSort = PluginListQuery["sort"];

function isCatalogSort(value: unknown): value is CatalogSort {
  return typeof value === "string" && catalogSortValues.includes(value as CatalogSort);
}

const sortLabels = {
  featured: "plugins.featured",
  trending: "plugins.trending",
  updated: "plugins.recentlyUpdated",
  new: "plugins.new",
  stars: "plugins.sortStars",
  downloads: "plugins.sortDownloads",
} as const;

export const Route = createFileRoute("/$locale/plugins/")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? search["q"].slice(0, 80) : "",
    category: typeof search["category"] === "string" ? search["category"] : "",
    sort: isCatalogSort(search["sort"]) ? search["sort"] : ("featured" as CatalogSort),
    cursor: typeof search["cursor"] === "string" ? search["cursor"] : "",
  }),
  search: {
    middlewares: [
      stripSearchParams({ q: "", category: "", sort: "featured" as CatalogSort, cursor: "" }),
    ],
  },
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    loadCatalog({
      data: {
        locale: parseLocale(params.locale),
        q: deps.q,
        sort: deps.sort,
        limit: 24,
        ...(deps.category ? { category: deps.category } : {}),
        ...(deps.cursor ? { cursor: deps.cursor } : {}),
      },
    }),
  head: ({ loaderData, params, match }) => {
    const t = createTranslator(parseLocale(params.locale));
    const hasIndexVariant = Object.values(match.search).some(
      (value) => Boolean(value) && value !== "featured",
    );
    return buildSeoHead({
      locale: parseLocale(params.locale),
      path: `/${params.locale}/plugins`,
      title: t("plugins.metaTitle"),
      description: t("plugins.intro"),
      robots: hasIndexVariant ? "noindex,follow" : "index,follow",
      alternates: localizedAlternates("/plugins"),
      structuredData: [
        {
          "@id": `https://dshx.io/${params.locale}/plugins#directory`,
          "@type": "CollectionPage",
          name: t("plugins.metaTitle"),
          description: t("plugins.intro"),
          url: `https://dshx.io/${params.locale}/plugins`,
          inLanguage: params.locale === "zh" ? "zh-CN" : "en",
          mainEntity: { "@id": `https://dshx.io/${params.locale}/plugins#items` },
        },
        {
          "@id": `https://dshx.io/${params.locale}/plugins#items`,
          "@type": "ItemList",
          numberOfItems: loaderData?.total ?? 0,
          itemListElement: (loaderData?.items ?? []).map((plugin, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: plugin.name,
            url: publicUrl(`/${params.locale}/plugins/${plugin.slug}`),
          })),
        },
        breadcrumbList([
          { name: "DSHX", path: `/${params.locale}` },
          { name: t("plugins.title"), path: `/${params.locale}/plugins` },
        ]),
      ],
    });
  },
  component: PluginsPage,
});

function PluginsPage() {
  const catalog = Route.useLoaderData();
  const search = Route.useSearch();
  const params = Route.useParams();
  const navigate = useNavigate({ from: "/$locale/plugins/" });
  const { t } = useI18n();
  const [query, setQuery] = useState(search.q);
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => setQuery(search.q), [search.q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (query.trim() === search.q) return;
      void navigate({ search: (old) => ({ ...old, q: query.trim(), cursor: "" }), replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [navigate, query, search.q]);

  function updateSearch(next: Partial<typeof search>) {
    void navigate({ search: (old) => ({ ...old, ...next, cursor: "" }) });
  }

  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="/plugins">{t("plugins.label")}</SectionLabel>
        <div className="mt-6 flex flex-col items-start justify-between gap-6 sm:flex-row sm:gap-10">
          <div className="min-w-0 flex-1">
            <h1 className="text-balance-tight text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-medium">
              {t("plugins.title")}
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              {t("plugins.intro")}
            </p>
          </div>
          <PluginSubmissionDialog />
        </div>

        <label className="mt-10 flex items-center gap-3 rounded-xl border border-border-strong bg-surface px-4 py-3 transition-colors focus-within:border-accent">
          <Search className="size-4 text-accent" aria-hidden="true" />
          <span className="sr-only">{t("plugins.search")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("plugins.search")}
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <Chip className="shrink-0 whitespace-nowrap">
            {t("plugins.results", { count: catalog.total })}
          </Chip>
        </label>

        <div className="mt-5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => updateSearch({ category: "" })}
            className={cn(
              "rounded-md border px-2.5 py-1 font-mono text-[11.5px] transition-colors",
              !search.category
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t("plugins.all")}
          </button>
          {catalog.categories.map((category) => (
            <Link
              key={category.slug}
              to="/$locale/categories/$slug"
              params={{ locale: params.locale, slug: category.slug }}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                updateSearch({
                  category: category.slug === search.category ? "" : category.slug,
                });
              }}
              className={cn(
                "rounded-md border px-2.5 py-1 font-mono text-[11.5px] transition-colors",
                search.category === category.slug
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {category.name}
            </Link>
          ))}
        </div>

        <div className="mt-10 flex items-end justify-between gap-5 border-b border-border">
          <div
            className="flex flex-wrap gap-x-5 gap-y-2"
            role="group"
            aria-label={t("plugins.sortLabel")}
          >
            {catalogSortValues.map((sort) => (
              <button
                type="button"
                key={sort}
                onClick={() => updateSearch({ sort })}
                aria-pressed={search.sort === sort}
                className={cn(
                  "relative pb-3 text-[13.5px] transition-colors",
                  search.sort === sort
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(sortLabels[sort])}
                {search.sort === sort ? (
                  <span className="absolute -bottom-px left-0 h-px w-full bg-accent" />
                ) : null}
              </button>
            ))}
          </div>
          <div className="mb-2 flex gap-1">
            {(["grid", "list"] as const).map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => setView(value)}
                aria-label={`${value} view`}
                className={cn(
                  "rounded-md p-2 transition-colors",
                  view === value ? "bg-surface-2 text-foreground" : "text-muted-foreground",
                )}
              >
                {value === "grid" ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
              </button>
            ))}
          </div>
        </div>

        {view === "grid" ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.items.map((plugin) => (
              <PluginCard key={plugin.slug} plugin={plugin} />
            ))}
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-xl border border-border bg-surface">
            {catalog.items.map((plugin) => (
              <PluginRow key={plugin.slug} plugin={plugin} />
            ))}
          </div>
        )}

        {catalog.items.length === 0 ? (
          <p className="mt-10 font-mono text-[12.5px] text-muted-foreground">
            {t("plugins.noMatches")}
          </p>
        ) : null}

        {catalog.totalPages > 0 ? (
          <nav
            aria-label={t("plugins.pagination")}
            className={cn(
              "mt-10 flex flex-wrap items-center gap-4 border-t border-border pt-4",
              catalog.nextCursor ? "justify-between" : "justify-center",
            )}
          >
            <span className="font-mono text-[11.5px] text-muted-foreground">
              {t("plugins.pagePosition", {
                page: catalog.page,
                totalPages: catalog.totalPages,
              })}
            </span>
            {catalog.nextCursor ? (
              <Link
                to="/$locale/plugins"
                params={{ locale: params.locale }}
                search={{ ...search, cursor: catalog.nextCursor }}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong bg-surface px-4 text-sm transition-colors hover:bg-surface-2"
              >
                {t("plugins.nextPage")} <ArrowRight className="size-4" data-icon="inline-end" />
              </Link>
            ) : null}
          </nav>
        ) : null}

        <div className="mt-16 rounded-xl border border-dashed border-border-strong p-6">
          <span className="mono-label">{t("plugins.publishing")}</span>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
            {t("plugins.publishingBody")}
          </p>
        </div>
      </Container>
    </main>
  );
}
