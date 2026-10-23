import { createFileRoute, notFound } from "@tanstack/react-router";

import { DocsChapter } from "@/components/dshx/docs-content";
import { getDocsChapter, isDocsSlug } from "@/lib/docs";
import { createTranslator, parseLocale } from "@/lib/i18n";
import {
  article,
  breadcrumbs,
  buildPageHead,
  localePath,
  localizedAlternates,
  organization,
} from "@/lib/seo";

export const Route = createFileRoute("/$locale/docs/$slug")({
  loader: ({ params }) => {
    if (!isDocsSlug(params.slug)) throw notFound();
    return { slug: params.slug };
  },
  head: ({ loaderData, params }) => {
    const locale = parseLocale(params.locale);
    const slug = loaderData?.slug ?? (isDocsSlug(params.slug) ? params.slug : "getting-started");
    const chapter = getDocsChapter(slug).copy[locale];
    const definition = getDocsChapter(slug);
    const t = createTranslator(locale);
    const title =
      slug === "getting-started"
        ? t("docs.pageTitle.gettingStarted")
        : slug === "compatibility"
          ? t("docs.pageTitle.compatibility")
          : `${chapter.title} · DSHX docs`;
    const to = `/docs/${slug}`;
    return buildPageHead({
      locale,
      path: localePath(locale, to),
      title,
      description: chapter.description,
      type: "article",
      alternates: localizedAlternates(to),
      structuredData: [
        organization(),
        article({
          locale,
          to,
          type: "TechArticle",
          headline: chapter.title,
          description: chapter.description,
          modified: definition.lastVerified,
          citation: definition.references.map((reference) => reference.url),
          partOf: "/docs",
        }),
        breadcrumbs(locale, [
          { name: t("nav.docs"), to: "/docs" },
          { name: chapter.title, to },
        ]),
      ],
    });
  },
  component: DocsChapterRoute,
});

function DocsChapterRoute() {
  const { slug } = Route.useLoaderData();
  return <DocsChapter slug={slug} />;
}
