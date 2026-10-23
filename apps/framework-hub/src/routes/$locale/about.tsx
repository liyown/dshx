import { createFileRoute } from "@tanstack/react-router";

import { PublicPageHeader } from "@/components/community/public-list";
import { Container, SectionLabel } from "@/components/dshx/primitives";
import { createTranslator, languageTag, parseLocale } from "@/lib/i18n";
import { aboutFacts } from "@/lib/public-content";
import { breadcrumbList, buildSeoHead, localizedAlternates } from "@/lib/seo";

export const Route = createFileRoute("/$locale/about")({
  head: ({ params }) => {
    const locale = parseLocale(params.locale);
    const t = createTranslator(locale);
    const path = `/${locale}/about`;
    return buildSeoHead({
      locale,
      path,
      title: `${t("about.title")} · DSHX`,
      description: t("about.description"),
      alternates: localizedAlternates("/about"),
      structuredData: [
        {
          "@id": "https://dshx.io/#organization",
          "@type": "Organization",
          name: "DSHX",
          url: "https://dshx.io",
          sameAs: [
            "https://github.com/liyown/dshx",
            "https://www.npmjs.com/package/@becomeopc/dshx",
          ],
        },
        {
          "@id": `https://dshx.io${path}#page`,
          "@type": "AboutPage",
          name: t("about.title"),
          description: t("about.description"),
          url: `https://dshx.io${path}`,
          inLanguage: languageTag(locale),
          about: { "@id": "https://dshx.io/#organization" },
        },
        breadcrumbList([
          { name: "DSHX", path: `/${locale}` },
          { name: t("about.title"), path },
        ]),
      ],
    });
  },
  component: AboutPage,
});

function AboutPage() {
  const locale = parseLocale(Route.useParams().locale);
  const t = createTranslator(locale);
  return (
    <main>
      <Container className="py-16 md:py-24">
        <PublicPageHeader
          eyebrow={t("about.eyebrow")}
          title={t("about.title")}
          description={t("about.description")}
        />

        <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_260px]">
          <div className="space-y-12">
            <section>
              <SectionLabel index="01">{t("about.boundary")}</SectionLabel>
              <p className="mt-5 max-w-3xl text-[15px] leading-7 text-muted-foreground">
                {t("about.boundaryBody")}
              </p>
            </section>
            <section>
              <SectionLabel index="02">{t("about.evidence")}</SectionLabel>
              <p className="mt-5 max-w-3xl text-[15px] leading-7 text-muted-foreground">
                {t("about.evidenceBody")}
              </p>
              <div className="mt-5 flex flex-wrap gap-4 font-mono text-[12px]">
                <a
                  href="https://github.com/liyown/dshx"
                  className="text-accent transition-colors hover:text-foreground"
                >
                  GitHub ↗
                </a>
                <a
                  href="https://www.npmjs.com/package/@becomeopc/dshx"
                  className="text-accent transition-colors hover:text-foreground"
                >
                  npm ↗
                </a>
              </div>
            </section>
          </div>
          <aside>
            <div className="space-y-px overflow-hidden rounded-xl border border-border bg-border">
              {aboutFacts.map(({ labelKey, value }) => (
                <div
                  key={labelKey}
                  className="flex items-center justify-between gap-4 bg-surface px-4 py-3"
                >
                  <span className="text-[12.5px] text-muted-foreground">{t(labelKey)}</span>
                  <span className="text-right font-mono text-[11.5px]">{value}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </Container>
    </main>
  );
}
