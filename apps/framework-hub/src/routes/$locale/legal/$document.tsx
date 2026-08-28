import { createFileRoute, notFound } from "@tanstack/react-router";

import { Container, SectionLabel } from "@/components/dshx/primitives";
import { parseLocale } from "@/lib/i18n";
import { isLegalDocument, legalDocuments } from "@/lib/public-content";
import { breadcrumbList, buildSeoHead, localizedAlternates } from "@/lib/seo";

const documents = legalDocuments;

export const Route = createFileRoute("/$locale/legal/$document")({
  loader: ({ params }) => {
    if (!isLegalDocument(params.document)) throw notFound();
    const document = documents[params.document];
    return document[parseLocale(params.locale)];
  },
  head: ({ loaderData, params }) => {
    const locale = parseLocale(params.locale);
    const title = loaderData?.title ?? "Policy";
    const path = `/${locale}/legal/${params.document}`;
    return buildSeoHead({
      locale,
      path,
      title: `${title} · DSHX Hub`,
      description: loaderData?.intro ?? "DSHX Hub policy",
      alternates: localizedAlternates(`/legal/${params.document}`),
      structuredData: [
        {
          "@id": `https://dshx.io${path}#page`,
          "@type": "WebPage",
          name: title,
          url: `https://dshx.io${path}`,
          inLanguage: locale === "zh" ? "zh-CN" : "en",
          dateModified: "2026-08-24",
        },
        breadcrumbList([
          { name: "DSHX", path: `/${locale}` },
          { name: title, path },
        ]),
      ],
    });
  },
  component: LegalPage,
});

function LegalPage() {
  const document = Route.useLoaderData();
  return (
    <main>
      <Container className="py-16 md:py-24">
        <SectionLabel index="policy">DSHX Hub</SectionLabel>
        <h1 className="mt-6 text-[clamp(2.25rem,6vw,4rem)] font-medium leading-none tracking-[-0.045em]">
          {document.title}
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-7 text-muted-foreground">
          {document.intro}
        </p>
        <div className="mt-12 max-w-3xl divide-y divide-border border-y border-border">
          {document.sections.map(([title, body]) => (
            <section key={title} className="grid gap-3 py-7 sm:grid-cols-[180px_1fr]">
              <h2 className="font-medium">{title}</h2>
              <p className="text-sm leading-7 text-muted-foreground">{body}</p>
            </section>
          ))}
        </div>
        <p className="mt-8 font-mono text-xs text-muted-foreground">
          Effective 2026-08-24 · contact security@dshx.io
        </p>
      </Container>
    </main>
  );
}
