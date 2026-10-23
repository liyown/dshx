import type { BlogPostSummary } from "@/lib/blog";
import { createTranslator, languageTag, type Locale } from "@/lib/i18n";
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

export function buildBlogListHead(locale: Locale, posts: readonly BlogPostSummary[]) {
  const t = createTranslator(locale);
  const path = `/${locale}/blog`;
  return buildSeoHead({
    locale,
    path,
    title: `${t("blog.title")} · DSHX`,
    description: t("blog.description"),
    alternates: localizedAlternates("/blog"),
    structuredData: [
      {
        "@type": "CollectionPage",
        "@id": publicUrl(path) + "#page",
        name: t("blog.title"),
        description: t("blog.description"),
        url: publicUrl(path),
        inLanguage: languageTag(locale),
        mainEntity: {
          "@type": "ItemList",
          itemListOrder: "https://schema.org/ItemListOrderDescending",
          numberOfItems: posts.length,
          itemListElement: posts.map((post, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: post.copy[locale].title,
            url: publicUrl(`${path}/${post.slug}`),
          })),
        },
      },
      breadcrumbList([
        { name: "DSHX", path: `/${locale}` },
        { name: t("blog.title"), path },
      ]),
    ],
  });
}

export function buildBlogArticleHead(locale: Locale, post: BlogPostSummary) {
  const t = createTranslator(locale);
  const copy = post.copy[locale];
  const path = `/${locale}/blog/${post.slug}`;
  const modified = post.updatedAt;
  const head = buildSeoHead({
    locale,
    path,
    title: `${copy.title} · DSHX`,
    description: copy.description,
    type: "article",
    alternates: localizedAlternates(`/blog/${post.slug}`),
    ...(post.coverImageUrl
      ? { image: { url: post.coverImageUrl, alt: copy.title } }
      : { image: { url: DEFAULT_SOCIAL_IMAGE, alt: copy.title, width: 1672, height: 941 } }),
    structuredData: [
      organization,
      {
        "@id": publicUrl(path) + "#article",
        "@type": "BlogPosting",
        headline: copy.title,
        description: copy.description,
        url: publicUrl(path),
        mainEntityOfPage: publicUrl(path),
        image: [post.coverImageUrl ?? DEFAULT_SOCIAL_IMAGE],
        inLanguage: languageTag(locale),
        datePublished: post.publishedAt,
        dateModified: modified,
        author: organization,
        publisher: organization,
        isPartOf: { "@id": publicUrl(`/${locale}/blog`) + "#page" },
      },
      breadcrumbList([
        { name: "DSHX", path: `/${locale}` },
        { name: t("blog.title"), path: `/${locale}/blog` },
        { name: copy.title, path },
      ]),
    ],
  });
  head.meta.push(
    { property: "article:published_time", content: post.publishedAt },
    { property: "article:modified_time", content: modified },
    { property: "article:section", content: t("blog.title") },
  );
  return head;
}
