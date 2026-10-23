import type { Locale } from "@/lib/i18n";

/**
 * A stored release note, as listings need it. The page's own copy lives in
 * the message table (`changelog.*`); what an entry carries is its content.
 */
export type ChangelogEntry = {
  readonly slug: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly version: string;
  readonly product: string;
  readonly channel: "preview" | "release";
  readonly status: "draft" | "published";
  readonly revision: number;
  readonly copy: Readonly<Record<Locale, { readonly title: string; readonly description: string }>>;
};
