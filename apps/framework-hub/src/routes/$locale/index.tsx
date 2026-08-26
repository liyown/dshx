import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import EchoText from "@/components/EchoText";
import {
  ButtonLink,
  Chip,
  Container,
  Lede,
  SectionHeading,
  SectionLabel,
  XMark,
} from "@/components/dshx/primitives";
import { Code, CodeSurface, Terminal } from "@/components/dshx/code";
import { CopyAgentPrompt } from "@/components/dshx/copy-agent-prompt";
import { RuntimeDiagram } from "@/components/dshx/runtime-diagram";
import { DevLoop } from "@/components/dshx/dev-loop";
import { PluginCard } from "@/components/dshx/plugin-card";
import { useHydratedReducedMotion } from "@/components/dshx/use-hydrated-reduced-motion";
import { useSiteScrollMotion } from "@/components/dshx/use-site-scroll-motion";
import { loadCatalog } from "@/lib/catalog/functions";
import type { CatalogCard } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { createTranslator, localizedPath, parseLocale, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/$locale/")({
  loader: ({ params }) =>
    loadCatalog({
      data: { locale: parseLocale(params.locale), q: "", sort: "featured", limit: 6 },
    }),
  head: ({ params }) => {
    const locale = parseLocale(params.locale);
    const t = createTranslator(locale);
    const canonical = `https://dshx.io/${locale}`;
    return {
      meta: [
        { title: t("seo.title") },
        {
          name: "description",
          content: t("seo.description"),
        },
        { property: "og:title", content: t("seo.title") },
        {
          property: "og:description",
          content: t("seo.ogDescription"),
        },
        { property: "og:url", content: canonical },
      ],
      links: [
        { rel: "canonical", href: canonical },
        { rel: "alternate", hrefLang: "en", href: "https://dshx.io/en" },
        { rel: "alternate", hrefLang: "zh", href: "https://dshx.io/zh" },
        { rel: "alternate", hrefLang: "x-default", href: "https://dshx.io/en" },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "DSHX",
            url: "https://dshx.io",
            inLanguage: locale === "zh" ? "zh-CN" : "en",
            description: t("seo.description"),
          }),
        },
      ],
    };
  },
  component: Home,
});

function Home() {
  const { items } = Route.useLoaderData();
  const reduceMotion = useHydratedReducedMotion();
  useSiteScrollMotion(reduceMotion);

  return (
    <main>
      <Hero />
      <WhyDshx />
      <AuthoringModel />
      <DevelopmentLoop />
      <Inspection />
      <ProgressivePower />
      <ReactUi />
      <Ecosystem plugins={items} />
    </main>
  );
}

/* ---------------- hero ---------------- */

function Hero() {
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden border-b border-border" data-scroll-section>
      <Container className="relative grid gap-14 py-20 md:py-28 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div data-scroll-surface>
          <div className="flex items-center gap-2" data-motion-hero="meta">
            <Chip tone="accent">v0.4.0</Chip>
            <span className="font-mono text-[11.5px] text-muted-foreground">
              {t("home.compatible")}
            </span>
          </div>
          <h1
            className="text-balance-tight mt-6 text-[clamp(2.4rem,5.6vw,4.2rem)] leading-[1.02] font-medium"
            data-motion-hero="title"
          >
            <EchoText
              text={t("home.heroTitle")}
              echoes={7}
              lag={0.2}
              offset={22}
              direction="diagonal"
              fade={0.58}
              blur={1.8}
              tint="var(--accent)"
              color="var(--foreground)"
              mode="entrance"
              duration={940}
              ease="ease-out"
              fontSize="inherit"
              fontWeight="inherit"
              className="hero-echo-text"
            />
          </h1>
          <p
            className="mt-6 max-w-xl text-[16px] leading-relaxed text-muted-foreground"
            data-motion-hero="copy"
          >
            {t("home.heroBody")}
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5" data-motion-hero="actions">
            <CopyAgentPrompt />
            <ButtonLink to="/docs" variant="outline">
              {t("home.apiReference")}
            </ButtonLink>
            <ButtonLink href="https://github.com/liyown/dshx" variant="ghost">
              {t("home.viewGithub")}
            </ButtonLink>
          </div>

          <div className="mt-10 max-w-md" data-motion-hero="terminal">
            <Terminal
              title={t("home.terminal")}
              lines={[
                { text: "pnpm create dshx my-plugin", kind: "cmd" },
                { text: "cd my-plugin", kind: "cmd" },
                { text: "pnpm dev", kind: "cmd" },
                { text: t("home.devWatching"), kind: "accent" },
              ]}
            />
          </div>
        </div>

        <div className="runtime-hero-entrance" data-motion-hero="diagram">
          <RuntimeDiagram />
        </div>
      </Container>
    </section>
  );
}

/* ---------------- why ---------------- */

const handled = [
  "home.handled.clientBundle",
  "home.handled.moduleLoader",
  "home.handled.reactExternal",
  "home.handled.css",
  "home.handled.slot",
  "home.handled.profile",
  "home.handled.hmr",
  "home.handled.maps",
] as const;

function WhyDshx() {
  const { t } = useI18n();
  return (
    <Section index="01" label={t("home.whyLabel")}>
      <SectionHeading>{t("home.whyTitle")}</SectionHeading>
      <Lede className="mt-5">{t("home.whyBody")}</Lede>

      <div className="mt-12 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
        <CodeSurface title="src/client.tsx">
          <Code
            code={`export default defineClient({
  slots: [
    defineSlot('sidebar.footer.action', {
      component: Status,
    }),
  ],
})`}
          />
        </CodeSurface>

        <div className="flex items-center justify-center gap-3 lg:flex-col">
          <span className="h-px w-10 bg-border lg:h-10 lg:w-px" />
          <XMark className="size-6 text-accent" />
          <span className="h-px w-10 bg-border lg:h-10 lg:w-px" />
        </div>

        <div
          className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border"
          data-scroll-surface
        >
          {handled.map((h, i) => (
            <div
              key={h}
              className="animate-rise flex items-center gap-2 bg-surface px-3.5 py-3 font-mono text-[11.5px]"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="size-1 rounded-full bg-accent/70" />
              {t(h)}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ---------------- authoring ---------------- */

function AuthoringModel() {
  const { t } = useI18n();
  return (
    <Section index="02" label={t("home.authoringLabel")}>
      <SectionHeading>{t("home.authoringTitle")}</SectionHeading>
      <Lede className="mt-5">{t("home.authoringBody")}</Lede>

      <div className="relative mt-12 grid gap-6 md:grid-cols-[1fr_140px_1fr] md:items-center">
        <CodeSurface title="src/host.ts">
          <Code
            code={`defineHost({
  tools: [searchTool],
  apis: [statusApi.host(...)]
})`}
          />
        </CodeSurface>

        <div className="relative flex h-24 items-center justify-center md:h-40">
          <svg viewBox="0 0 140 160" className="h-full w-full" aria-hidden>
            <line
              x1="0"
              y1="60"
              x2="140"
              y2="100"
              stroke="currentColor"
              strokeWidth="1"
              className="text-border-strong"
            />
            <line
              x1="0"
              y1="100"
              x2="140"
              y2="60"
              stroke="currentColor"
              strokeWidth="1"
              className="text-border-strong"
            />
            <line
              x1="0"
              y1="60"
              x2="140"
              y2="100"
              stroke="currentColor"
              strokeWidth="1.25"
              className="animate-flow text-accent"
            />
            <line
              x1="140"
              y1="60"
              x2="0"
              y2="100"
              stroke="currentColor"
              strokeWidth="1.25"
              className="animate-flow text-accent"
            />
            <circle cx="70" cy="80" r="3" className="fill-accent" />
          </svg>
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 font-mono text-[10.5px] whitespace-nowrap text-muted-foreground">
            {t("home.typedContract")}
          </span>
        </div>

        <CodeSurface title="src/client.tsx">
          <Code
            code={`defineClient({
  slots: [sidebarStatus]
})`}
          />
        </CodeSurface>
      </div>
    </Section>
  );
}

/* ---------------- dev loop ---------------- */

function DevelopmentLoop() {
  const { t } = useI18n();
  return (
    <Section index="03" label={t("home.loopLabel")}>
      <SectionHeading>{t("home.loopTitle")}</SectionHeading>
      <Lede className="mt-5">{t("home.loopBody")}</Lede>
      <div className="mt-12">
        <DevLoop />
      </div>
    </Section>
  );
}

/* ---------------- inspection ---------------- */

function Inspection() {
  const { t } = useI18n();
  return (
    <Section index="04" label={t("home.inspectLabel")}>
      <SectionHeading>{t("home.inspectTitle")}</SectionHeading>
      <Lede className="mt-5">{t("home.inspectBody")}</Lede>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <Terminal
          title="dshx inspect"
          lines={[
            { text: t("home.inspectCommand"), kind: "cmd" },
            { text: "", kind: "dim" },
            { text: "sidebar.footer.action", kind: "accent" },
            { text: "conversation.chat.node", kind: "dim" },
            { text: "conversation.input.right", kind: "dim" },
            { text: "conversation.session", kind: "dim" },
          ]}
        />
        <Terminal
          title="dshx add"
          lines={[
            { text: t("home.addCommand"), kind: "cmd" },
            { text: "", kind: "dim" },
            { text: t("home.created"), kind: "ok" },
            { text: t("home.registered"), kind: "dim" },
            { text: t("home.propsResolved"), kind: "dim" },
          ]}
        />
      </div>
    </Section>
  );
}

/* ---------------- progressive power ---------------- */

const stages = [
  `defineHost({
  tools: [weather]
})`,
  `defineHost({
  tools: [weather],

  commands: [refresh],
})`,
  `defineHost({
  tools: [weather],

  commands: [refresh],

  apis: [weatherApi.host(...)],

  setup(ctx) {
    ctx.on('agent/pre-step', ...)
  }
})`,
];

function ProgressivePower() {
  const { t } = useI18n();
  const [stage, setStage] = useState(0);
  const stageLabels = [t("home.minimal"), t("home.commands"), t("home.fullRuntime")];
  return (
    <Section index="05" label={t("home.powerLabel")}>
      <SectionHeading>{t("home.powerTitle")}</SectionHeading>
      <Lede className="mt-5">{t("home.powerBody")}</Lede>

      <div className="mt-12 grid gap-6 lg:grid-cols-[220px_1fr] lg:items-start">
        <div className="flex gap-2 lg:flex-col" data-scroll-surface>
          {stageLabels.map((s, i) => (
            <button
              key={s}
              onMouseEnter={() => setStage(i)}
              onFocus={() => setStage(i)}
              onClick={() => setStage(i)}
              className={cn(
                "flex flex-1 items-center gap-3 rounded-lg border px-3 py-2.5 text-left font-mono text-[11.5px] transition-colors",
                stage === i
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <span>0{i + 1}</span>
              {s}
            </button>
          ))}
        </div>
        <CodeSurface title="src/host.ts">
          <Code code={stages[stage]!} />
        </CodeSurface>
      </div>
    </Section>
  );
}

/* ---------------- react ui ---------------- */

function ReactUi() {
  const { t } = useI18n();
  return (
    <Section index="06" label={t("home.reactLabel")}>
      <SectionHeading>{t("home.reactTitle")}</SectionHeading>
      <Lede className="mt-5">{t("home.reactBody")}</Lede>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <CodeSurface title="src/ui/sidebar-status.tsx">
          <Code
            code={`import styles from './status.module.css'

export function Status({ session }: SlotProps<'sidebar.footer.action'>) {
  const status = useApiQuery(statusApi, 'get', {
    input: { id: session.id },
  })

  return (
    <div className={styles.root}>
      <span className={styles.dot} data-state={status.data?.state} />
      <span className={styles.label}>{status.data?.label ?? 'idle'}</span>
    </div>
  )
}`}
          />
        </CodeSurface>

        {/* mock DSH interface */}
        <div
          className="overflow-hidden rounded-xl border border-ink-border bg-ink"
          data-scroll-surface
        >
          <div className="flex items-center justify-between border-b border-ink-border px-4 py-2.5 font-mono text-[11px] text-ink-muted">
            <span>{t("home.workspace")}</span>
            <span>{t("home.slotPreview")}</span>
          </div>
          <div className="grid grid-cols-[150px_1fr] gap-px bg-ink-border">
            <div className="flex min-h-[280px] flex-col bg-ink p-3">
              <div className="space-y-2">
                {[t("home.sessions"), t("home.agents"), t("home.tools"), t("home.memory")].map(
                  (s) => (
                    <div
                      key={s}
                      className="rounded-md px-2 py-1.5 font-mono text-[11px] text-ink-muted"
                    >
                      {s}
                    </div>
                  ),
                )}
              </div>
              <div className="mt-auto rounded-lg border border-ink-accent/40 bg-ink-accent/10 px-2.5 py-2">
                <div className="flex items-center gap-2 font-mono text-[11px] text-ink-foreground">
                  <span className="animate-node-pulse size-1.5 rounded-full bg-ok" />
                  {t("home.runningTools")}
                </div>
                <div className="mt-1 font-mono text-[9.5px] text-ink-muted">
                  sidebar.footer.action
                </div>
              </div>
            </div>
            <div className="space-y-3 bg-ink p-4">
              {[72, 88, 46, 64].map((w, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-1.5 rounded-full bg-ink-border" style={{ width: `${w}%` }} />
                  <div
                    className="h-1.5 rounded-full bg-ink-border/60"
                    style={{ width: `${w - 22}%` }}
                  />
                </div>
              ))}
              <div className="mt-6 rounded-lg border border-ink-border p-3 font-mono text-[10.5px] text-ink-muted">
                {t("home.typedSlotProps")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ---------------- ecosystem ---------------- */

function Ecosystem({ plugins }: { plugins: CatalogCard[] }) {
  const { locale, t } = useI18n();
  return (
    <Section index="07" label={t("home.ecosystemLabel")}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionHeading>{t("home.ecosystemTitle")}</SectionHeading>
          <Lede className="mt-5">{t("home.ecosystemBody")}</Lede>
        </div>
        <Link
          to={localizedPath(locale, "/plugins")}
          className="group inline-flex items-center gap-2 text-[13.5px] text-accent"
        >
          {t("home.explorePlugins")}
          <span className="transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plugins.slice(0, 6).map((p) => (
          <PluginCard key={p.slug} plugin={p} />
        ))}
      </div>
    </Section>
  );
}

/* ---------------- shared ---------------- */

function Section({
  index,
  label,
  children,
}: {
  index: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border py-20 md:py-28" data-scroll-section>
      <Container>
        <SectionLabel index={index}>{label}</SectionLabel>
        <div className="mt-8">{children}</div>
      </Container>
    </section>
  );
}
