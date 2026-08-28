import { createFileRoute, notFound } from "@tanstack/react-router";

import { DocsChapter } from "@/components/dshx/docs-content";
import { getDocsChapter, isDocsSlug } from "@/lib/docs";
import { parseLocale } from "@/lib/i18n";
import { breadcrumbList, buildSeoHead, localizedAlternates } from "@/lib/seo";

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
    const title =
      slug === "getting-started"
        ? locale === "zh"
          ? "使用 DSHX 创建 DeepSeek Harness 插件"
          : "Create a DeepSeek Harness Plugin with DSHX"
        : slug === "compatibility"
          ? locale === "zh"
            ? "DSHX 与 DeepSeek Harness 版本兼容性"
            : "DSHX Compatibility with DeepSeek Harness Versions"
          : `${chapter.title} · DSHX docs`;
    const path = `/${locale}/docs/${slug}`;
    return buildSeoHead({
      locale,
      path,
      title,
      description: chapter.description,
      type: "article",
      alternates: localizedAlternates(`/docs/${slug}`),
      structuredData: [
        {
          "@id": `https://dshx.io${path}#article`,
          "@type": "TechArticle",
          headline: title,
          description: chapter.description,
          url: `https://dshx.io${path}`,
          inLanguage: locale === "zh" ? "zh-CN" : "en",
          dateModified: definition.lastVerified,
          author: { "@id": "https://dshx.io/#organization" },
          publisher: { "@id": "https://dshx.io/#organization" },
          citation: definition.references.map((reference) => reference.url),
        },
        breadcrumbList([
          { name: "DSHX", path: `/${locale}` },
          { name: "Docs", path: `/${locale}/docs` },
          { name: chapter.title, path },
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
