import type { Locale } from "@/lib/i18n";

export type DocsGroup = "start" | "contributions" | "runtime";

export type DocsTerminalLine = {
  readonly text: string;
  readonly kind?: "cmd" | "out" | "ok" | "dim" | "accent";
};

export type DocsApiRow = {
  readonly name: string;
  readonly type: string;
  readonly body: string;
};

export type DocsBlock =
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "code"; readonly title: string; readonly code: string }
  | {
      readonly kind: "terminal";
      readonly title?: string;
      readonly lines: readonly DocsTerminalLine[];
    }
  | { readonly kind: "note"; readonly text: string }
  | { readonly kind: "list"; readonly items: readonly string[] }
  | {
      readonly kind: "steps";
      readonly items: readonly { readonly title: string; readonly body: string }[];
    }
  | { readonly kind: "api"; readonly rows: readonly DocsApiRow[] };

export interface DocsSection {
  readonly id: string;
  readonly label?: string;
  readonly title: string;
  readonly blocks: readonly DocsBlock[];
}

export interface DocsChapterCopy {
  readonly navigation: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
  readonly description: string;
  readonly sections: readonly DocsSection[];
}

export interface DocsReference {
  readonly label: string;
  readonly url: string;
}

export interface DocsChapterDefinition<Slug extends string = string> {
  readonly slug: Slug;
  readonly group: DocsGroup;
  readonly lastVerified: string;
  readonly references: readonly DocsReference[];
  readonly copy: Readonly<Record<Locale, DocsChapterCopy>>;
}

export function defineDocsChapter<const Slug extends string>(
  chapter: Omit<DocsChapterDefinition<Slug>, "lastVerified" | "references"> &
    Partial<Pick<DocsChapterDefinition<Slug>, "lastVerified" | "references">>,
): DocsChapterDefinition<Slug> {
  return {
    lastVerified: "2026-08-28",
    references: [{ label: "DSHX source repository", url: "https://github.com/liyown/dshx" }],
    ...chapter,
  };
}
