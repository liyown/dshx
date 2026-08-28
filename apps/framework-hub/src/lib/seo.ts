import type { Locale } from "@/lib/i18n";

export const PUBLIC_SITE_URL = "https://dshx.io";
export const DEFAULT_SOCIAL_IMAGE = `${PUBLIC_SITE_URL}/dshx-runtime-reference.png`;

type StructuredDataNode = Readonly<Record<string, unknown>>;

export type SeoDocument = {
  readonly locale: Locale;
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly robots?: string;
  readonly alternates?:
    | false
    | {
        readonly en: string;
        readonly zh: string;
        readonly default?: string;
      };
  readonly image?:
    | false
    | {
        readonly url: string;
        readonly alt: string;
        readonly width?: number;
        readonly height?: number;
      };
  readonly type?: "website" | "article";
  readonly structuredData?: readonly StructuredDataNode[];
};

export function normalizePublicPath(path: string): string {
  const withoutQueryOrHash = path.split(/[?#]/, 1)[0] ?? "/";
  const withLeadingSlash = withoutQueryOrHash.startsWith("/")
    ? withoutQueryOrHash
    : `/${withoutQueryOrHash}`;
  if (withLeadingSlash === "/") return withLeadingSlash;
  return withLeadingSlash.replace(/\/+$/, "");
}

export function publicUrl(path: string): string {
  return `${PUBLIC_SITE_URL}${normalizePublicPath(path)}`;
}

export function localizedAlternates(path: string): NonNullable<SeoDocument["alternates"]> {
  const suffix = normalizePublicPath(path);
  const localizedSuffix = suffix === "/" ? "" : suffix;
  return {
    en: `/en${localizedSuffix}`,
    zh: `/zh${localizedSuffix}`,
    default: `/en${localizedSuffix}`,
  };
}

export function localizedAlternatesForLocales(
  path: string,
  locales: readonly Locale[],
): NonNullable<SeoDocument["alternates"]> | false {
  const ready = new Set(locales);
  return ready.has("en") && ready.has("zh") ? localizedAlternates(path) : false;
}

export function buildSeoHead(document: SeoDocument) {
  const canonical = publicUrl(document.path);
  const image =
    document.image === false
      ? null
      : (document.image ?? {
          url: DEFAULT_SOCIAL_IMAGE,
          alt: document.title,
          width: 1672,
          height: 941,
        });
  const alternates = document.alternates === undefined ? false : document.alternates;
  const meta: Array<Record<string, string>> = [
    { title: document.title },
    { name: "description", content: document.description },
    { name: "robots", content: document.robots ?? "index,follow" },
    { property: "og:title", content: document.title },
    { property: "og:description", content: document.description },
    { property: "og:type", content: document.type ?? "website" },
    { property: "og:url", content: canonical },
    { property: "og:locale", content: document.locale === "zh" ? "zh_CN" : "en_US" },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: document.title },
    { name: "twitter:description", content: document.description },
  ];

  if (alternates) {
    meta.push({
      property: "og:locale:alternate",
      content: document.locale === "zh" ? "en_US" : "zh_CN",
    });
  }

  if (image) {
    meta.push(
      { property: "og:image", content: image.url },
      { property: "og:image:alt", content: image.alt },
      { name: "twitter:image", content: image.url },
    );
    if (image.width !== undefined)
      meta.push({ property: "og:image:width", content: String(image.width) });
    if (image.height !== undefined)
      meta.push({ property: "og:image:height", content: String(image.height) });
  }

  const links: Array<Record<string, string>> = [{ rel: "canonical", href: canonical }];
  if (alternates) {
    links.push(
      { rel: "alternate", hrefLang: "en", href: publicUrl(alternates.en) },
      { rel: "alternate", hrefLang: "zh", href: publicUrl(alternates.zh) },
      {
        rel: "alternate",
        hrefLang: "x-default",
        href: publicUrl(alternates.default ?? alternates.en),
      },
    );
  }

  return {
    meta,
    links,
    scripts:
      document.structuredData && document.structuredData.length > 0
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@graph": document.structuredData,
              }),
            },
          ]
        : [],
  };
}

export function breadcrumbList(
  items: readonly { readonly name: string; readonly path: string }[],
): StructuredDataNode {
  const pagePath = items[items.length - 1]?.path ?? "/";
  return {
    "@id": `${publicUrl(pagePath)}#breadcrumbs`,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: publicUrl(item.path),
    })),
  };
}
