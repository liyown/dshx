import { createFileRoute } from "@tanstack/react-router";

import { DocsOverview } from "@/components/dshx/docs-content";
import { createTranslator, languageTag, parseLocale } from "@/lib/i18n";
import { buildSeoHead, localizedAlternates } from "@/lib/seo";

export const Route = createFileRoute("/$locale/docs/")({
  head: ({ params }) => {
    const locale = parseLocale(params.locale);
    const t = createTranslator(locale);
    return buildSeoHead({
      locale,
      path: `/${locale}/docs`,
      title: t("docs.head.title"),
      description: t("docs.head.description"),
      alternates: localizedAlternates("/docs"),
      structuredData: [
        {
          "@id": `https://dshx.io/${locale}/docs#collection`,
          "@type": "CollectionPage",
          name: t("docs.head.title"),
          description: t("docs.head.description"),
          url: `https://dshx.io/${locale}/docs`,
          inLanguage: languageTag(locale),
        },
      ],
    });
  },
  component: DocsOverview,
});
