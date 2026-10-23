import { createFileRoute } from "@tanstack/react-router";

import { DocsOverview } from "@/components/dshx/docs-content";
import { createTranslator, parseLocale } from "@/lib/i18n";
import { buildPageHead, collection, localizedAlternates } from "@/lib/seo";

export const Route = createFileRoute("/$locale/docs/")({
  head: ({ params }) => {
    const locale = parseLocale(params.locale);
    const t = createTranslator(locale);
    return buildPageHead({
      locale,
      path: `/${locale}/docs`,
      title: t("docs.head.title"),
      description: t("docs.head.description"),
      alternates: localizedAlternates("/docs"),
      structuredData: [
        ...collection({
          locale,
          to: "/docs",
          name: t("docs.head.title"),
          description: t("docs.head.description"),
        }),
      ],
    });
  },
  component: DocsOverview,
});
