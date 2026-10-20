import type { FeaturedSection } from "@/lib/featured.repository.server";
import { featuredCopy } from "@/lib/featured";
import type { Locale } from "@/lib/i18n";
import { breadcrumbList, buildSeoHead, localizedAlternates, publicUrl } from "@/lib/seo";

export function buildFeaturedHead(locale: Locale, sections: readonly FeaturedSection[]) {
  const copy = featuredCopy[locale];
  const path = `/${locale}/featured`;
  const plugins = sections.flatMap((section) => section.plugins);
  return buildSeoHead({
    locale,
    path,
    title: `${copy.title} · DSHX`,
    description: copy.description,
    alternates: localizedAlternates("/featured"),
    structuredData: [
      {
        "@type": "CollectionPage",
        "@id": publicUrl(path) + "#page",
        name: copy.title,
        description: copy.description,
        url: publicUrl(path),
        inLanguage: locale === "zh" ? "zh-CN" : "en",
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: plugins.length,
          itemListElement: plugins.map((plugin, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: plugin.name,
            url: publicUrl(`/${locale}/plugins/${plugin.slug}`),
          })),
        },
      },
      breadcrumbList([
        { name: "DSHX", path: `/${locale}` },
        { name: copy.title, path },
      ]),
    ],
  });
}
