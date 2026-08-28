import { createFileRoute } from "@tanstack/react-router";

import { PublicPageHeader } from "@/components/community/public-list";
import { Container, SectionLabel } from "@/components/dshx/primitives";
import { parseLocale } from "@/lib/i18n";
import { aboutCopy } from "@/lib/public-content";
import { breadcrumbList, buildSeoHead, localizedAlternates } from "@/lib/seo";

export const Route = createFileRoute("/$locale/about")({
  head: ({ params }) => {
    const locale = parseLocale(params.locale);
    const content = aboutCopy[locale];
    const path = `/${locale}/about`;
    return buildSeoHead({
      locale,
      path,
      title: `${content.title} · DSHX`,
      description: content.description,
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
          name: content.title,
          description: content.description,
          url: `https://dshx.io${path}`,
          inLanguage: locale === "zh" ? "zh-CN" : "en",
          about: { "@id": "https://dshx.io/#organization" },
        },
        breadcrumbList([
          { name: "DSHX", path: `/${locale}` },
          { name: content.title, path },
        ]),
      ],
    });
  },
  component: AboutPage,
});

function AboutPage() {
  const locale = parseLocale(Route.useParams().locale);
  const content = aboutCopy[locale];
  return (
    <main>
      <Container className="py-16 md:py-24">
        <PublicPageHeader
          eyebrow={content.eyebrow}
          title={content.title}
          description={content.description}
        />

        <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_260px]">
          <div className="space-y-12">
            <section>
              <SectionLabel index="01">{content.boundary}</SectionLabel>
              <p className="mt-5 max-w-3xl text-[15px] leading-7 text-muted-foreground">
                {content.boundaryBody}
              </p>
            </section>
            <section>
              <SectionLabel index="02">{content.evidence}</SectionLabel>
              <p className="mt-5 max-w-3xl text-[15px] leading-7 text-muted-foreground">
                {content.evidenceBody}
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
              {content.facts.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4 bg-surface px-4 py-3"
                >
                  <span className="text-[12.5px] text-muted-foreground">{label}</span>
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
