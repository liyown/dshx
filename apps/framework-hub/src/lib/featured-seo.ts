import type { FeaturedSection } from "@/lib/featured.repository.server";
import { createTranslator, languageTag, type Locale } from "@/lib/i18n";
import { breadcrumbList, buildSeoHead, localizedAlternates, publicUrl } from "@/lib/seo";

export function buildFeaturedHead(locale: Locale, sections: readonly FeaturedSection[]) {
  const t = createTranslator(locale);
  const path = `/${locale}/featured`;
  const plugins = sections.flatMap((section) => section.plugins);
  return buildSeoHead({
    locale,
    path,
    title: `${t("featured.title")} · DSHX`,
    description: t("featured.description"),
    alternates: localizedAlternates("/featured"),
    structuredData: [
      {
        "@type": "CollectionPage",
        "@id": publicUrl(path) + "#page",
        name: t("featured.title"),
        description: t("featured.description"),
        url: publicUrl(path),
        inLanguage: languageTag(locale),
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
        { name: t("featured.title"), path },
      ]),
    ],
  });
}
