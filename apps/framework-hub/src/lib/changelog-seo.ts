import { changelogCopy, type ChangelogEntry } from "@/lib/changelog";
import type { Locale } from "@/lib/i18n";
import {
  breadcrumbList,
  buildSeoHead,
  DEFAULT_SOCIAL_IMAGE,
  localizedAlternates,
  publicUrl,
} from "@/lib/seo";

const organization = {
  "@id": publicUrl("/") + "#organization",
  "@type": "Organization",
  name: "DSHX",
  url: publicUrl("/"),
};

export function buildChangelogListHead(
  locale: Locale,
  changelogEntries: readonly ChangelogEntry[],
) {
  const copy = changelogCopy[locale];
  const path = `/${locale}/changelog`;
  return buildSeoHead({
    locale,
    path,
    title: `${copy.title} · DSHX`,
    description: copy.description,
    alternates: localizedAlternates("/changelog"),
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
          itemListOrder: "https://schema.org/ItemListOrderDescending",
          numberOfItems: changelogEntries.length,
          itemListElement: changelogEntries.map((entry, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: entry.copy[locale].title,
            url: publicUrl(`${path}/${entry.slug}`),
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

export function buildChangelogArticleHead(locale: Locale, entry: ChangelogEntry) {
  const copy = entry.copy[locale];
  const path = `/${locale}/changelog/${entry.slug}`;
  const modified = entry.updatedAt ?? entry.publishedAt;
  const head = buildSeoHead({
    locale,
    path,
    title: `${copy.title} · ${entry.product} ${entry.version} · DSHX`,
    description: copy.description,
    type: "article",
    alternates: localizedAlternates(`/changelog/${entry.slug}`),
    structuredData: [
      organization,
      {
        "@id": publicUrl(path) + "#article",
        "@type": "BlogPosting",
        headline: copy.title,
        description: copy.description,
        url: publicUrl(path),
        mainEntityOfPage: publicUrl(path),
        image: [DEFAULT_SOCIAL_IMAGE],
        inLanguage: locale === "zh" ? "zh-CN" : "en",
        datePublished: entry.publishedAt,
        dateModified: modified,
        author: organization,
        publisher: organization,
        isPartOf: { "@id": publicUrl(`/${locale}/changelog`) + "#page" },
      },
      breadcrumbList([
        { name: "DSHX", path: `/${locale}` },
        { name: changelogCopy[locale].title, path: `/${locale}/changelog` },
        { name: copy.title, path },
      ]),
    ],
  });
  head.meta.push(
    { property: "article:published_time", content: entry.publishedAt },
    { property: "article:modified_time", content: modified },
    { property: "article:section", content: changelogCopy[locale].title },
  );
  return head;
}
