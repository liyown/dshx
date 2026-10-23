import { languageTag, type Locale } from "@/lib/i18n";

import type { SchemaNode } from "./head";
import { localePath, publicUrl, PUBLIC_SITE_URL } from "./urls";

export type { SchemaNode };

export const GITHUB_URL = "https://github.com/liyown/dshx";
export const NPM_URL = "https://www.npmjs.com/package/@becomeopc/dshx";

const SITE = publicUrl("/");
const ORGANIZATION_ID = `${SITE}#organization`;
/** The site-wide node a directory can declare itself part of. */
export const WEBSITE_ID = `${SITE}#website`;
const SOURCE_ID = `${SITE}#source`;

/** The one envelope every renderer embeds a page's nodes in. */
export function schemaGraph(nodes: readonly SchemaNode[]): Record<string, unknown> {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/** One entity identity per page: the fragment reserved for that part of the page. */
function pageId(locale: Locale, to: string, part: string): string {
  return `${publicUrl(localePath(locale, to))}#${part}`;
}

const organizationReference = { "@id": ORGANIZATION_ID } as const;

/** The site's publisher. Every graph that names DSHX as author or publisher includes this node. */
export function organization(): SchemaNode {
  return {
    "@id": ORGANIZATION_ID,
    "@type": "Organization",
    name: "DSHX",
    url: PUBLIC_SITE_URL,
    sameAs: [GITHUB_URL, NPM_URL],
  };
}

export function website(input: {
  readonly locale: Locale;
  readonly description: string;
}): SchemaNode {
  return {
    "@id": WEBSITE_ID,
    "@type": "WebSite",
    name: "DSHX",
    alternateName: ["DSHX Hub", "DeepSeek Harness Plugin Hub"],
    url: PUBLIC_SITE_URL,
    inLanguage: languageTag(input.locale),
    description: input.description,
    publisher: organizationReference,
  };
}

export function sourceCode(input: {
  readonly description: string;
  readonly version: string;
}): SchemaNode {
  return {
    "@id": SOURCE_ID,
    "@type": "SoftwareSourceCode",
    name: "DSHX",
    description: input.description,
    codeRepository: GITHUB_URL,
    programmingLanguage: ["TypeScript", "JavaScript"],
    license: "https://opensource.org/license/mit",
    runtimePlatform: "DeepSeek Harness",
    version: input.version,
  };
}

export type Crumb = {
  /** The label a reader sees. */
  readonly name: string;
  /** The page's locale-relative path, e.g. `/plugins`; the locale prefix is added here. */
  readonly to: string;
};

/**
 * The trail for one page. The home page is always its first stop, so no caller
 * repeats it; the last crumb identifies the page the trail belongs to.
 */
export function breadcrumbs(locale: Locale, trail: readonly Crumb[]): SchemaNode {
  const stops: readonly Crumb[] = [{ name: "DSHX", to: "/" }, ...trail];
  const last = stops[stops.length - 1] ?? { name: "DSHX", to: "/" };
  return {
    "@id": `${publicUrl(localePath(locale, last.to))}#breadcrumbs`,
    "@type": "BreadcrumbList",
    itemListElement: stops.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: publicUrl(localePath(locale, crumb.to)),
    })),
  };
}

export type CollectionItem = {
  readonly name: string;
  readonly to: string;
};

/**
 * A page that lists other pages. Returns the page node plus, when the page has
 * entries, the `ItemList` it points at; `count` carries the full total when only
 * one page of entries was loaded.
 */
export function collection(input: {
  readonly locale: Locale;
  readonly to: string;
  readonly name: string;
  readonly description?: string;
  readonly items?: readonly CollectionItem[];
  readonly count?: number;
  readonly order?: "descending";
  readonly partOf?: string;
}): readonly SchemaNode[] {
  const items = input.items ?? [];
  const count = input.count ?? items.length;
  const page: SchemaNode = {
    "@id": pageId(input.locale, input.to, "collection"),
    "@type": "CollectionPage",
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    url: publicUrl(localePath(input.locale, input.to)),
    inLanguage: languageTag(input.locale),
    ...(input.partOf ? { isPartOf: { "@id": input.partOf } } : {}),
    ...(input.items || input.count !== undefined
      ? { mainEntity: { "@id": pageId(input.locale, input.to, "items") } }
      : {}),
  };
  if (!input.items && input.count === undefined) return [page];
  return [
    page,
    {
      "@id": pageId(input.locale, input.to, "items"),
      "@type": "ItemList",
      ...(input.order === "descending"
        ? { itemListOrder: "https://schema.org/ItemListOrderDescending" }
        : {}),
      numberOfItems: count,
      ...(items.length > 0
        ? {
            itemListElement: items.map((item, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: item.name,
              url: publicUrl(localePath(input.locale, item.to)),
            })),
          }
        : {}),
    },
  ];
}

/** An article page: a blog post, a changelog entry, an operation report, or an API chapter. */
export function article(input: {
  readonly locale: Locale;
  readonly to: string;
  readonly type: "Article" | "BlogPosting" | "TechArticle";
  readonly headline: string;
  readonly description: string;
  readonly published?: string;
  readonly modified?: string;
  readonly image?: readonly string[];
  readonly citation?: readonly string[];
  /** The listing page this article belongs to, as a locale-relative path. */
  readonly partOf?: string;
}): SchemaNode {
  return {
    "@id": pageId(input.locale, input.to, "article"),
    "@type": input.type,
    headline: input.headline,
    description: input.description,
    url: publicUrl(localePath(input.locale, input.to)),
    mainEntityOfPage: publicUrl(localePath(input.locale, input.to)),
    ...(input.image ? { image: input.image } : {}),
    inLanguage: languageTag(input.locale),
    ...(input.published ? { datePublished: input.published } : {}),
    ...(input.modified ? { dateModified: input.modified } : {}),
    author: organizationReference,
    publisher: organizationReference,
    ...(input.partOf
      ? { isPartOf: { "@id": pageId(input.locale, input.partOf, "collection") } }
      : {}),
    ...(input.citation ? { citation: input.citation } : {}),
  };
}

export function aboutPage(input: {
  readonly locale: Locale;
  readonly to: string;
  readonly name: string;
  readonly description: string;
}): SchemaNode {
  return {
    "@id": pageId(input.locale, input.to, "page"),
    "@type": "AboutPage",
    name: input.name,
    description: input.description,
    url: publicUrl(localePath(input.locale, input.to)),
    inLanguage: languageTag(input.locale),
    about: organizationReference,
  };
}

export function webPage(input: {
  readonly locale: Locale;
  readonly to: string;
  readonly name: string;
  readonly description: string;
  readonly modified?: string;
}): SchemaNode {
  return {
    "@id": pageId(input.locale, input.to, "page"),
    "@type": "WebPage",
    name: input.name,
    description: input.description,
    url: publicUrl(localePath(input.locale, input.to)),
    inLanguage: languageTag(input.locale),
    ...(input.modified ? { dateModified: input.modified } : {}),
  };
}

export type ProfileEntity = {
  readonly type: "Person" | "Organization";
  readonly name: string;
  readonly description?: string;
  readonly image?: string;
};

/** A person or organization page: the page node and the entity it profiles. */
export function profilePage(input: {
  readonly locale: Locale;
  readonly to: string;
  readonly name: string;
  readonly description: string;
  readonly entity: ProfileEntity;
}): readonly SchemaNode[] {
  return [
    {
      "@id": pageId(input.locale, input.to, "profile"),
      "@type": "ProfilePage",
      name: input.name,
      description: input.description,
      url: publicUrl(localePath(input.locale, input.to)),
      inLanguage: languageTag(input.locale),
      mainEntity: { "@id": pageId(input.locale, input.to, "subject") },
    },
    {
      "@id": pageId(input.locale, input.to, "subject"),
      "@type": input.entity.type,
      name: input.entity.name,
      url: publicUrl(localePath(input.locale, input.to)),
      ...(input.entity.description ? { description: input.entity.description } : {}),
      ...(input.entity.image ? { image: input.entity.image } : {}),
    },
  ];
}

/** A plugin's record as an installable application. */
export function pluginApplication(input: {
  readonly locale: Locale;
  readonly to: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly compatibility: string;
  readonly author: string;
  readonly sameAs: readonly string[];
  readonly rating?: { readonly average: number; readonly count: number };
}): SchemaNode {
  return {
    "@id": pageId(input.locale, input.to, "software"),
    "@type": "SoftwareApplication",
    name: input.name,
    description: input.description,
    url: publicUrl(localePath(input.locale, input.to)),
    applicationCategory: "DeveloperApplication",
    softwareVersion: input.version,
    softwareRequirements: `DeepSeek Harness ${input.compatibility}`,
    operatingSystem: "Cross-platform",
    author: { "@type": "Person", name: input.author },
    isPartOf: { "@id": pageId(input.locale, "/plugins", "collection") },
    sameAs: input.sameAs,
    ...(input.rating && input.rating.count >= 2
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: input.rating.average,
            ratingCount: input.rating.count,
          },
        }
      : {}),
  };
}

export function faqPage(input: {
  readonly locale: Locale;
  readonly to: string;
  readonly entries: readonly { readonly question: string; readonly answer: string }[];
  readonly partOf?: string;
}): SchemaNode {
  return {
    "@id": pageId(input.locale, input.to, "faq"),
    "@type": "FAQPage",
    inLanguage: languageTag(input.locale),
    ...(input.partOf ? { isPartOf: { "@id": input.partOf } } : {}),
    mainEntity: input.entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}
