import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Container, SectionLabel, Chip } from "@/components/dshx/primitives";
import { PluginCard, PluginRow } from "@/components/dshx/plugin-card";
import { categories, plugins } from "@/lib/plugins";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/plugins/")({
  head: () => ({
    meta: [
      { title: "DSH Plugins — Discover the DSHX ecosystem" },
      {
        name: "description",
        content:
          "Browse DSH plugins built with DSHX: tools, UI slots, agents, memory and integrations, with versions and runtime compatibility.",
      },
      { property: "og:title", content: "DSH Plugins — Discover the DSHX ecosystem" },
      {
        property: "og:description",
        content: "A package ecosystem for DSH: featured, trending and recently updated plugins.",
      },
    ],
  }),
  component: PluginsPage,
});

const tabs = ["Featured", "Trending", "Recently Updated", "New"] as const;

function PluginsPage() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Featured");
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
    if (tab === "Featured") list = [...list].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
    if (tab === "Trending") list = list.filter((p) => p.trending || !cat).sort((a, b) => b.stars - a.stars);
    if (tab === "New") list = [...list].sort((a, b) => Number(!!b.isNew) - Number(!!a.isNew));
    return list;
  }, [query, cat, tab]);

  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="/plugins">Registry preview</SectionLabel>
        <h1 className="text-balance-tight mt-6 text-[clamp(2rem,4.5vw,3.25rem)] leading-[1.05] font-medium">
          DSH plugins, built with DSHX.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          An open registry for the DSH runtime. Curated today, community-published next. No
          pricing, no ratings — versions, compatibility and maintainers.
        </p>

        <div className="mt-10 flex items-center gap-3 rounded-xl border border-border-strong bg-surface px-4 py-3 transition-colors focus-within:border-accent">
          <span className="font-mono text-[13px] text-accent">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search DSH plugins…"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <Chip className="shrink-0 whitespace-nowrap">{results.length} results</Chip>
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
            All
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
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "relative pb-3 text-[13.5px] transition-colors",
                  tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
                {tab === t && <span className="absolute -bottom-px left-0 h-px w-full bg-accent" />}
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
            no plugins matched · try a different category
          </p>
        )}

        <div className="mt-16 rounded-xl border border-dashed border-border-strong p-6">
          <span className="mono-label">Publishing</span>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
            Open publishing is not live yet. Plugins listed here are curated from the community.
            DSHX is the development framework — the community builds the ecosystem.
          </p>
        </div>
      </Container>
    </main>
  );
}
