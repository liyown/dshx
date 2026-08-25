import type { Locale } from "@/lib/i18n";

import { cliAndInspect } from "./chapters/cli-and-inspect";
import { compatibility } from "./chapters/compatibility";
import { conversation } from "./chapters/conversation";
import { gettingStarted } from "./chapters/getting-started";
import { hostContributions } from "./chapters/host-contributions";
import { projectModel } from "./chapters/project-model";
import { settings } from "./chapters/settings";
import { typedApi } from "./chapters/typed-api";
import type { DocsChapterDefinition, DocsGroup } from "./types";

const DOC_CHAPTERS = [
  gettingStarted,
  projectModel,
  hostContributions,
  settings,
  typedApi,
  conversation,
  cliAndInspect,
  compatibility,
] as const satisfies readonly DocsChapterDefinition[];

type ChapterSlugTuple<Chapters extends readonly DocsChapterDefinition[]> = {
  readonly [Index in keyof Chapters]: Chapters[Index]["slug"];
};

/** Stable ordered chapter slugs shared by routes, sitemap generation, and tests. */
export const DOC_SLUGS = DOC_CHAPTERS.map((chapter) => chapter.slug) as unknown as ChapterSlugTuple<
  typeof DOC_CHAPTERS
>;

export type DocsSlug = (typeof DOC_SLUGS)[number];

/** Historic single-page anchors mapped to their new chapter and section. */
export const LEGACY_DOC_HASH_TARGETS = {
  installation: { slug: "getting-started", section: "create" },
  "project-structure": { slug: "getting-started", section: "structure" },
  "development-workflow": { slug: "getting-started", section: "develop" },
  "runtime-inspection": { slug: "cli-and-inspect", section: "inspect" },
  "host-api": { slug: "host-contributions", section: "definition" },
  "client-api": { slug: "project-model", section: "client" },
  "typed-api": { slug: "typed-api", section: "contract" },
  "cli-reference": { slug: "cli-and-inspect", section: "commands" },
} as const satisfies Readonly<
  Record<string, { readonly slug: DocsSlug; readonly section: string }>
>;

const chapterBySlug = new Map<DocsSlug, (typeof DOC_CHAPTERS)[number]>(
  DOC_CHAPTERS.map((chapter) => [chapter.slug, chapter]),
);

const groupCopy: Readonly<Record<DocsGroup, Readonly<Record<Locale, string>>>> = {
  start: { en: "Start and Client", zh: "开始与 Client" },
  contributions: { en: "Contribution APIs", zh: "贡献 API" },
  runtime: { en: "Tooling APIs", zh: "工具 API" },
};

export interface DocsNavigationItem {
  readonly slug: DocsSlug;
  readonly label: string;
  readonly href: string;
  readonly experimental: boolean;
}

export interface DocsNavigationGroup {
  readonly id: DocsGroup;
  readonly label: string;
  readonly items: readonly DocsNavigationItem[];
}

export function isDocsSlug(value: string | undefined): value is DocsSlug {
  return DOC_SLUGS.some((slug) => slug === value);
}

export function getDocsChapter(slug: DocsSlug): (typeof DOC_CHAPTERS)[number] {
  const chapter = chapterBySlug.get(slug);
  if (chapter === undefined) throw new Error(`Unknown DSHX docs chapter: ${slug}`);
  return chapter;
}

export function getDocsNavigation(locale: Locale): readonly DocsNavigationGroup[] {
  const groups: DocsGroup[] = ["start", "contributions", "runtime"];
  return groups.map((group) => ({
    id: group,
    label: groupCopy[group][locale],
    items: DOC_CHAPTERS.filter((chapter) => chapter.group === group).map((chapter) => ({
      slug: chapter.slug,
      label: chapter.copy[locale].navigation,
      href: `/${locale}/docs/${chapter.slug}`,
      experimental: chapter.slug === "conversation",
    })),
  }));
}

export { DOC_CHAPTERS };
export type { DocsBlock, DocsChapterCopy, DocsChapterDefinition, DocsSection } from "./types";
