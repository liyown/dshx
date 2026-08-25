import { createFileRoute, notFound } from "@tanstack/react-router";

import { DocsChapter } from "@/components/dshx/docs-content";
import { getDocsChapter, isDocsSlug } from "@/lib/docs";
import { parseLocale } from "@/lib/i18n";

export const Route = createFileRoute("/$locale/docs/$slug")({
  loader: ({ params }) => {
    if (!isDocsSlug(params.slug)) throw notFound();
    return { slug: params.slug };
  },
  head: ({ loaderData, params }) => {
    const locale = parseLocale(params.locale);
    const slug = loaderData?.slug ?? (isDocsSlug(params.slug) ? params.slug : "getting-started");
    const chapter = getDocsChapter(slug).copy[locale];
    const title = `${chapter.title} · DSHX docs`;
    return {
      meta: [
        { title },
        { name: "description", content: chapter.description },
        { property: "og:title", content: title },
        { property: "og:description", content: chapter.description },
        { name: "robots", content: "index,follow" },
      ],
      links: [{ rel: "canonical", href: `https://dshx.io/${locale}/docs/${slug}` }],
    };
  },
  component: DocsChapterRoute,
});

function DocsChapterRoute() {
  const { slug } = Route.useLoaderData();
  return <DocsChapter slug={slug} />;
}
