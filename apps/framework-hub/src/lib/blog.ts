import type { Locale } from "@/lib/i18n";

/**
 * A stored article, as listings need it. The copy this page renders lives in
 * the message table (`blog.*`), not here: an article carries its own title
 * and description per locale, which is content, not interface text.
 */
export type BlogPostSummary = {
  readonly slug: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly status: "draft" | "published";
  readonly revision: number;
  readonly coverImageUrl: string | null;
  readonly copy: Readonly<Record<Locale, { readonly title: string; readonly description: string }>>;
};
