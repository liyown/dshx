import { ogLocale, otherLocale, type Locale } from "@/lib/i18n";

import { schemaGraph } from "./schema";
import type { Alternates } from "./urls";
import { DEFAULT_SOCIAL_IMAGE, localizedAlternatesForLocales, publicUrl } from "./urls";

export type SchemaNode = Readonly<Record<string, unknown>>;

export type PageHeadInput = {
  readonly locale: Locale;
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly robots?: string;
  readonly alternates?: false | Alternates;
  readonly image?:
    | false
    | {
        readonly url: string;
        readonly alt: string;
        readonly width?: number;
        readonly height?: number;
        readonly type?: string;
      };
  readonly type?: "website" | "article";
  /** Open Graph article metadata, for pages of `type: "article"`. */
  readonly article?: {
    readonly published?: string;
    readonly modified?: string;
    readonly section?: string;
  };
  readonly structuredData?: readonly SchemaNode[];
};

/**
 * The head fields that follow from a page's indexable locales.
 *
 * A page is indexable in the locale exactly when the page inventory lists that
 * locale, and a page only advertises alternates when every language they name
 * is indexable. Keeping both in one function means a route cannot set the
 * robots directive and the alternates from different answers.
 */
export function pageIndexation(
  path: string,
  indexableLocales: readonly Locale[],
  locale: Locale,
): { readonly robots: string; readonly alternates: false | Alternates } {
  return {
    robots: indexableLocales.includes(locale) ? "index,follow" : "noindex,follow",
    alternates: localizedAlternatesForLocales(path, indexableLocales),
  };
}

/** A page title in the site's convention: `<title> · <brand> · at most one separator`. */
export function pageTitle(title: string, brand = "DSHX"): string {
  return `${title} · ${brand}`;
}

/**
 * Assembles a page's head: canonical link, reciprocal alternates, Open Graph and
 * X metadata, and one schema.org graph. Callers supply the identity and the
 * entities; this is the only place that knows how they are rendered.
 */
export function buildPageHead(document: PageHeadInput) {
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
    { property: "og:locale", content: ogLocale(document.locale) },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: document.title },
    { name: "twitter:description", content: document.description },
  ];

  if (alternates) {
    meta.push({
      property: "og:locale:alternate",
      content: ogLocale(otherLocale(document.locale)),
    });
  }

  if (image) {
    meta.push(
      { property: "og:image", content: image.url },
      { property: "og:image:alt", content: image.alt },
      { name: "twitter:image", content: image.url },
      { name: "twitter:image:alt", content: image.alt },
    );
    if (image.type) meta.push({ property: "og:image:type", content: image.type });
    if (image.width !== undefined)
      meta.push({ property: "og:image:width", content: String(image.width) });
    if (image.height !== undefined)
      meta.push({ property: "og:image:height", content: String(image.height) });
  }

  if (document.article) {
    if (document.article.published)
      meta.push({ property: "article:published_time", content: document.article.published });
    if (document.article.modified)
      meta.push({ property: "article:modified_time", content: document.article.modified });
    if (document.article.section)
      meta.push({ property: "article:section", content: document.article.section });
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
              children: JSON.stringify(schemaGraph(document.structuredData)).replaceAll(
                "<",
                "\\u003c",
              ),
            },
          ]
        : [],
  };
}
