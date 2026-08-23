import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Container, SectionLabel, Chip } from "@/components/dshx/primitives";
import { PluginCard, PluginRow } from "@/components/dshx/plugin-card";
import { categories, plugins } from "@/lib/plugins";
import { cn } from "@/lib/utils";
import { createTranslator, parseLocale, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/$locale/plugins/")({
  head: ({ params }) => {
    const t = createTranslator(parseLocale(params.locale));
    return {
    meta: [
      { title: t("plugins.title") },
      {
        name: "description",
        content: t("plugins.intro"),
      },
      { property: "og:title", content: t("plugins.title") },
      {
        property: "og:description",
        content: t("plugins.intro"),
      },
    ],
    };
  },
  component: PluginsPage,
});

const tabs = ["Featured", "Trending", "Recently Updated", "New"] as const;

function PluginsPage() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [activeTab, setTab] = useState<(typeof tabs)[number]>("Featured");
  const [view, setView] = useState<"grid" | "list">("grid");

  const results = useMemo(() => {
    let list = plugins.filter(
      (p) =>
        (!cat || p.category === cat) &&
        (query.trim() === "" ||
          `${p.name} ${p.scope} ${p.description} ${p.author}`
            .toLowerCase()
            .includes(query.toLowerCase())),
    );
    if (activeTab === "Featured") list = [...list].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
    if (activeTab === "Trending") list = list.filter((p) => p.trending || !cat).sort((a, b) => b.stars - a.stars);
    if (activeTab === "New") list = [...list].sort((a, b) => Number(!!b.isNew) - Number(!!a.isNew));
    return list;
  }, [query, cat, activeTab]);

  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="/plugins">{t("plugins.label")}</SectionLabel>
        <h1 className="text-balance-tight mt-6 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-medium">
          {t("plugins.title")}
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          {t("plugins.intro")}
        </p>

        <div className="mt-10 flex items-center gap-3 rounded-xl border border-border-strong bg-surface px-4 py-3 transition-colors focus-within:border-accent">
          <span className="font-mono text-[13px] text-accent">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("plugins.search")}
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <Chip className="shrink-0 whitespace-nowrap">
            {t("plugins.results", { count: results.length })}
          </Chip>
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          <button
            onClick={() => setCat(null)}
            className={cn(
              "rounded-md border px-2.5 py-1 font-mono text-[11.5px] transition-colors",
              cat === null
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t("plugins.all")}
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c === cat ? null : c)}
              className={cn(
                "rounded-md border px-2.5 py-1 font-mono text-[11.5px] transition-colors",
                cat === c
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-10 flex items-center justify-between border-b border-border pb-3">
          <div className="flex gap-4">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setTab(tab)}
                className={cn(
                  "relative pb-3 text-[13.5px] transition-colors",
                  activeTab === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab === "Featured"
                  ? t("plugins.featured")
                  : tab === "Trending"
                    ? t("plugins.trending")
                    : tab === "Recently Updated"
                      ? t("plugins.recentlyUpdated")
                      : t("plugins.new")}
                {activeTab === tab && (
                  <span className="absolute -bottom-px left-0 h-px w-full bg-accent" />
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-1 font-mono text-[11px]">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-2 py-1 transition-colors",
                  view === v ? "bg-surface-2 text-foreground" : "text-muted-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {view === "grid" ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((p) => (
              <PluginCard key={p.slug} plugin={p} />
            ))}
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-xl border border-border bg-surface">
            {results.map((p) => (
              <PluginRow key={p.slug} plugin={p} />
            ))}
          </div>
        )}

        {results.length === 0 && (
          <p className="mt-10 font-mono text-[12.5px] text-muted-foreground">
            {t("plugins.noMatches")}
          </p>
        )}

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
