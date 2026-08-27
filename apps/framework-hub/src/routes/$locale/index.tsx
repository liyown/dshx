import { createFileRoute, Link } from "@tanstack/react-router";
import EchoText from "@/components/EchoText";
import { CoreCapabilities } from "@/components/dshx/core-capabilities";
import {
  ButtonLink,
  Chip,
  Container,
  Lede,
  SectionHeading,
  SectionLabel,
} from "@/components/dshx/primitives";
import { Terminal } from "@/components/dshx/code";
import { CopyAgentPrompt } from "@/components/dshx/copy-agent-prompt";
import { RuntimeDiagram } from "@/components/dshx/runtime-diagram";
import { PluginCard } from "@/components/dshx/plugin-card";
import { useHydratedReducedMotion } from "@/components/dshx/use-hydrated-reduced-motion";
import { useSiteScrollMotion } from "@/components/dshx/use-site-scroll-motion";
import { loadCatalog } from "@/lib/catalog/functions";
import type { CatalogCard } from "@/lib/catalog/types";
import { createTranslator, localizedPath, parseLocale, useI18n } from "@/lib/i18n";
import { DSHX_VERSION, MARKETPLACE_REFERENCE_PLUGIN } from "@/lib/reference-plugin";

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
      <Capabilities />
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
            <Chip tone="accent">v{DSHX_VERSION}</Chip>
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

const advantages = [
  {
    title: "home.advantage.web.title",
    body: "home.advantage.web.body",
    proof: "React · TSX · Vite",
  },
  {
    title: "home.advantage.runtime.title",
    body: "home.advantage.runtime.body",
    proof: "inspect · add · check",
  },
  {
    title: "home.advantage.thin.title",
    body: "home.advantage.thin.body",
    proof: "DSH · Cordis",
  },
] as const;

function WhyDshx() {
  const { t } = useI18n();
  return (
    <Section index="01" label={t("home.whyLabel")}>
      <SectionHeading>{t("home.whyTitle")}</SectionHeading>
      <Lede className="mt-5">{t("home.whyBody")}</Lede>

      <div
        className="mt-12 grid border-y border-border md:grid-cols-3 md:divide-x md:divide-border"
        data-scroll-surface
      >
        {advantages.map((advantage) => (
          <article
            key={advantage.title}
            className="border-b border-border py-7 last:border-b-0 md:border-b-0 md:px-7 md:first:pl-0 md:last:pr-0"
          >
            <div className="font-mono text-[11px] text-accent">{advantage.proof}</div>
            <h3 className="mt-3 text-[19px] leading-snug font-medium">{t(advantage.title)}</h3>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
              {t(advantage.body)}
            </p>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ---------------- capabilities ---------------- */

function Capabilities() {
  const { t } = useI18n();
  return (
    <Section index="02" label={t("home.capabilitiesLabel")}>
      <CoreCapabilities />
    </Section>
  );
}

/* ---------------- ecosystem ---------------- */

function Ecosystem({ plugins }: { plugins: CatalogCard[] }) {
  const { locale, t } = useI18n();
  const reference = MARKETPLACE_REFERENCE_PLUGIN;
  return (
    <Section index="03" label={t("home.ecosystemLabel")}>
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

      <article className="mt-12 overflow-hidden rounded-xl border border-border bg-surface lg:grid lg:grid-cols-[1.25fr_0.75fr]">
        <div className="p-6 md:p-8">
          <Chip tone="accent">{t("home.referenceBadge")}</Chip>
          <h3 className="mt-5 max-w-2xl text-[clamp(1.4rem,2.8vw,2rem)] leading-tight font-medium tracking-[-0.025em]">
            {t("home.referenceTitle")}
          </h3>
          <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
            {t("home.referenceBody")}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11.5px] text-muted-foreground">
            <span className="text-foreground">{reference.packageName}</span>
            <span aria-hidden="true" className="text-border-strong">
              /
            </span>
            <span>v{reference.version}</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <ButtonLink href={reference.sourceUrl} variant="outline">
              {t("home.referenceSource")}
            </ButtonLink>
            <Link
              to="/$locale/plugins"
              params={{ locale }}
              search={{ q: reference.packageName, category: "", sort: "featured", cursor: "" }}
              className="inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-[13.5px] font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              {t("home.referenceMarketplace")}
            </Link>
          </div>
        </div>
        <div className="flex min-h-48 flex-col justify-center border-t border-ink-border bg-ink p-6 text-ink-foreground lg:border-t-0 lg:border-l md:p-8">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
            {t("home.referenceInstall")}
          </span>
          <code className="mt-5 block overflow-x-auto whitespace-nowrap font-mono text-[13px]">
            <span className="text-ink-accent">$ </span>
            {reference.installCommand}
          </code>
        </div>
      </article>

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
