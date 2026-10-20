import { blogCopy, type BlogPostSummary } from "@/lib/blog";
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

export function buildBlogListHead(locale: Locale, posts: readonly BlogPostSummary[]) {
  const copy = blogCopy[locale];
  const path = `/${locale}/blog`;
  return buildSeoHead({
    locale,
    path,
    title: `${copy.title} · DSHX`,
    description: copy.description,
    alternates: localizedAlternates("/blog"),
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
        { name: copy.title, path },
      ]),
    ],
  });
}

export function buildBlogArticleHead(locale: Locale, post: BlogPostSummary) {
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
        inLanguage: locale === "zh" ? "zh-CN" : "en",
        datePublished: post.publishedAt,
        dateModified: modified,
        author: organization,
        publisher: organization,
        isPartOf: { "@id": publicUrl(`/${locale}/blog`) + "#page" },
      },
      breadcrumbList([
        { name: "DSHX", path: `/${locale}` },
        { name: blogCopy[locale].title, path: `/${locale}/blog` },
        { name: copy.title, path },
      ]),
    ],
  });
  head.meta.push(
    { property: "article:published_time", content: post.publishedAt },
    { property: "article:modified_time", content: modified },
    { property: "article:section", content: blogCopy[locale].title },
  );
  return head;
}
