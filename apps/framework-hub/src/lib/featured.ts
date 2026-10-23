import type { Translate } from "@/lib/i18n";

/**
 * Editorial shelf names and descriptions.
 *
 * Featured picks are stored against existing catalog categories, but the
 * featured page uses its own copy so the catalog taxonomy can stay stable
 * while the shelves stay opinionated. The words live in the message table
 * (`featured.shelf.<slug>`); this module owns which slugs exist and in what
 * order they read.
 */
export const featuredShelfSlugs = [
  "ui",
  "remote",
  "memory",
  "model",
  "agent-automation",
  "dev",
  "vision",
  "market",
  "session",
  "fun",
] as const;

export type FeaturedShelfSlug = (typeof featuredShelfSlugs)[number];

const featuredShelfOrder = new Map(featuredShelfSlugs.map((slug, index) => [slug, index]));

export function isFeaturedShelfSlug(slug: string): slug is FeaturedShelfSlug {
  return (featuredShelfSlugs as readonly string[]).includes(slug);
}

/**
 * Editorial shelves have their own reading order, independent of the catalog's
 * category sort order. Unknown categories keep their database order after the
 * known shelves so operators can add a shelf before this module ships copy
 * for it.
 */
export function orderFeaturedSections<T extends { readonly slug: string }>(
  sections: readonly T[],
): T[] {
  return [...sections].sort((left, right) => {
    const leftOrder = featuredShelfOrder.get(left.slug as FeaturedShelfSlug);
    const rightOrder = featuredShelfOrder.get(right.slug as FeaturedShelfSlug);
    if (leftOrder === undefined && rightOrder === undefined) return 0;
    if (leftOrder === undefined) return 1;
    if (rightOrder === undefined) return -1;
    return leftOrder - rightOrder;
  });
}

/**
 * Overlay editorial copy on a database-backed section. Unknown category slugs
 * keep their stored localization so operators can add a shelf before this
 * module ships a name for it.
 */
export function withFeaturedShelfCopy<
  T extends { readonly slug: string; readonly name: string; readonly description: string | null },
>(section: T, t: Translate): T {
  if (!isFeaturedShelfSlug(section.slug)) return section;
  return {
    ...section,
    name: t(`featured.shelf.${section.slug}.name`),
    description: t(`featured.shelf.${section.slug}.description`),
  };
}
