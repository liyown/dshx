import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Container, Chip, ButtonLink, SectionLabel } from "@/components/dshx/primitives";
import { CodeSurface, Code } from "@/components/dshx/code";
import { getPlugin, plugins } from "@/lib/plugins";
import { cn } from "@/lib/utils";
import { createTranslator, localizedPath, parseLocale, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/$locale/plugins/$slug")({
  loader: ({ params }) => {
    const plugin = getPlugin(params.slug);
    if (!plugin) throw notFound();
    return { plugin };
  },
  head: ({ loaderData, params }) => {
    const t = createTranslator(parseLocale(params.locale));
    if (!loaderData) {
      return {
        meta: [{ title: t("errors.pageNotFound") + " — DSHX" }, { name: "robots", content: "noindex" }],
      };
    }
    const p = loaderData.plugin;
    return {
      meta: [
        { title: `${p.name} — DSH plugin · DSHX` },
        { name: "description", content: p.description },
        { property: "og:title", content: `${p.name} — DSH plugin` },
        { property: "og:description", content: p.description },
      ],
    };
  },
  component: PluginDetail,
});

const sections = ["Overview", "README", "Versions", "Compatibility", "Dependencies", "Changelog"];
const sectionKeys = {
  Overview: "plugin.overview",
  README: "plugin.readme",
  Versions: "plugin.versions",
  Compatibility: "plugin.compatibility",
  Dependencies: "plugin.dependencies",
  Changelog: "plugin.changelog",
} as const;

function PluginDetail() {
  const { plugin } = Route.useLoaderData();
  const { locale, t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState("Overview");
  const install = `dsh plugin add ${plugin.scope}`;

  const related = plugins.filter((p) => p.slug !== plugin.slug).slice(0, 3);

  return (
    <main>
      <Container className="py-12 md:py-16">
        <Link
          to={localizedPath(locale, "/plugins")}
          className="font-mono text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("plugin.back")}
        </Link>

        <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-5">
            <div className="relative flex size-16 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 font-mono text-2xl">
              {plugin.glyph}
              <span className="absolute right-1.5 bottom-1.5 size-1 rounded-full bg-accent" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[28px] leading-tight font-medium tracking-[-0.03em]">
                  {plugin.name}
                </h1>
                <Chip tone={plugin.badge === "official" ? "accent" : plugin.badge === "verified" ? "ok" : "neutral"}>
                  {plugin.badge}
                </Chip>
              </div>
              <div className="mt-1 font-mono text-[12.5px] text-muted-foreground">
                {plugin.scope} · v{plugin.version} · {plugin.author}
              </div>
              <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-muted-foreground">
                {plugin.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(install);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="inline-flex h-10 items-center gap-3 rounded-[10px] border border-ink-border bg-ink px-3.5 font-mono text-[12.5px] text-ink-foreground transition-colors hover:border-ink-accent/60"
            >
              <span className="text-ink-accent">$</span>
              {install}
              <span className={cn("text-[11px]", copied ? "text-ok" : "text-ink-muted")}>
                {copied ? t("plugin.copied") : t("plugin.copy")}
              </span>
            </button>
            <ButtonLink href="https://github.com" variant="outline">
              {t("plugin.openGithub")}
            </ButtonLink>
          </div>
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_260px]">
          <div>
            <div className="flex flex-wrap gap-5 border-b border-border pb-3">
              {sections.map((s) => (
                <button
                  key={s}
                  onClick={() => setActive(s)}
                  className={cn(
                    "relative pb-3 text-[13.5px] transition-colors",
                    active === s ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(sectionKeys[s as keyof typeof sectionKeys])}
                  {active === s && (
                    <span className="absolute -bottom-px left-0 h-px w-full bg-accent" />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-8 space-y-6">
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                {t("plugin.description", { name: plugin.name })}
              </p>

              <CodeSurface title="src/client.tsx">
                <Code
                  code={`import { defineClient, defineSlot } from 'dshx/client'
import { ${plugin.name.replace(/\s/g, "")}Panel } from './ui/panel'

export default defineClient({
  slots: [
    defineSlot('sidebar.footer.action', {
      component: ${plugin.name.replace(/\s/g, "")}Panel,
    }),
  ],
})`}
                />
              </CodeSurface>

              <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
                {[
                  ["Versions", `${plugin.version} · latest`],
                  ["Dependencies", "dshx ^0.4"],
                  ["Changelog", `updated ${plugin.updated}`],
                ].map(([k, v]) => (
                  <div key={k} className="bg-surface p-4">
                    <div className="mono-label">{k}</div>
                    <div className="mt-2 font-mono text-[12.5px]">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-px overflow-hidden rounded-xl border border-border bg-border">
            {[
              ["Latest version", `v${plugin.version}`],
              ["Compatibility", plugin.compat],
              ["License", "MIT"],
              ["Repository", "github.com"],
              ["Updated", plugin.updated],
              ["Downloads", plugin.downloads],
              ["Stars", String(plugin.stars)],
              ["Category", plugin.category],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between bg-surface px-4 py-3">
                <span className="text-[12.5px] text-muted-foreground">{k}</span>
                <span className="font-mono text-[12px]">{v}</span>
              </div>
            ))}
          </aside>
        </div>

        <div className="mt-20">
          <SectionLabel index="→">{t("plugin.related")}</SectionLabel>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {related.map((p) => (
              <Link
                key={p.slug}
                to={localizedPath(locale, "/plugins/" + p.slug)}
                className="rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
              >
                <div className="text-[14px] font-medium">{p.name}</div>
                <div className="mt-1 font-mono text-[11.5px] text-muted-foreground">{p.scope}</div>
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}
