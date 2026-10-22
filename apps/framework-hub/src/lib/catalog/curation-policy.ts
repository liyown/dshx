/**
 * When curated copy is present but not usable in public.
 *
 * A curation row can exist and still be placeholder text: the package name
 * repeated as the description, a one-line overview, or a missing locale. The
 * ops detail renders this from TypeScript while the list and status
 * projections have to apply it in SQL before pagination, so both adapters
 * read the thresholds and phrases from here.
 */

export const MIN_SHORT_DESCRIPTION_EN = 40;
export const MIN_SHORT_DESCRIPTION_ZH = 12;
export const MIN_OVERVIEW_EN = 400;

/** Placeholder descriptions published by generators and package templates. */
export const GENERIC_SHORT_DESCRIPTIONS: ReadonlySet<string> = new Set([
  "a plugin",
  "a plugin for deepseek harness",
  "a plugin for dsh",
  "deepseek harness plugin",
  "dsh plugin",
  "plugin for deepseek harness",
  "plugin for dsh",
  "todo",
  "no description",
]);

export type CurationCopy = {
  readonly shortDescription?: Record<string, unknown> | undefined;
  readonly overviewMarkdown?: Record<string, unknown> | undefined;
};

export type CurationIdentity = {
  readonly slug: string;
  readonly name: string;
  readonly packageName: string | null;
};

function localizedText(value: Record<string, unknown> | undefined, locale: string): string {
  const text = value?.[locale];
  return typeof text === "string" ? text.trim() : "";
}

export function isWeakCuration(curation: CurationCopy, identity: CurationIdentity): boolean {
  const en = localizedText(curation.shortDescription, "en");
  const zh = localizedText(curation.shortDescription, "zh");
  const overview = localizedText(curation.overviewMarkdown, "en");
  return (
    en.length < MIN_SHORT_DESCRIPTION_EN ||
    zh.length < MIN_SHORT_DESCRIPTION_ZH ||
    en === identity.slug ||
    en === identity.name ||
    (identity.packageName !== null && en === identity.packageName) ||
    en.startsWith("@") ||
    GENERIC_SHORT_DESCRIPTIONS.has(en.toLowerCase()) ||
    overview.length < MIN_OVERVIEW_EN
  );
}

/**
 * The SQL twin of `isWeakCuration`, for projections that must filter before
 * pagination. Expects `p` (plugins) and `c` (plugin_curations) in scope. The
 * phrase list is inlined because it is a module constant, never user input.
 */
export const weakCurationSql = `(
  coalesce(length(trim(json_extract(c.short_description_json,'$.en'))),0) < ${MIN_SHORT_DESCRIPTION_EN}
  or coalesce(length(trim(json_extract(c.short_description_json,'$.zh'))),0) < ${MIN_SHORT_DESCRIPTION_ZH}
  or trim(json_extract(c.short_description_json,'$.en')) in (p.slug,p.name,p.package_name)
  or trim(json_extract(c.short_description_json,'$.en')) like '@%'
  or lower(trim(json_extract(c.short_description_json,'$.en'))) in (${[
    ...GENERIC_SHORT_DESCRIPTIONS,
  ]
    .map((phrase) => `'${phrase.replaceAll("'", "''")}'`)
    .join(",")})
  or coalesce(length(trim(json_extract(c.overview_markdown_json,'$.en'))),0) < ${MIN_OVERVIEW_EN}
)`;
