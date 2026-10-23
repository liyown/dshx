import { createTranslator } from "@/lib/i18n";

export type CatalogLocale = "en" | "zh";

const lowInformationCopyPatterns = [
  /the public source does not provide a separate feature list/i,
  /consult the preserved readme for exact behavior/i,
  /README 记录的主要能力和行为包括：The public source/i,
  /具体用途以已保存的公开 README 为准/u,
  /具体能力以已保存的公开 README 为准/u,
  /^.+是面向 DeepSeek Harness 的插件[，。]/u,
];

export function isLowInformationCatalogCopy(value: string): boolean {
  const normalized = normalizeCopy(value);
  return lowInformationCopyPatterns.some((pattern) => pattern.test(normalized));
}

function normalizeCopy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function trimTrailingFragment(value: string): string {
  return value.replace(/[\s,;:，；：—-]+$/u, "").trim();
}

export function truncateCatalogCopy(value: string, maximum: number, locale: CatalogLocale): string {
  const normalized = normalizeCopy(value);
  if (normalized.length <= maximum) return normalized;

  const candidate = normalized.slice(0, maximum + 1);
  const punctuation = [...candidate.matchAll(/[.!?。！？]/gu)].at(-1)?.index ?? -1;
  if (punctuation >= Math.floor(maximum * 0.62)) return candidate.slice(0, punctuation + 1).trim();

  if (locale === "en") {
    const wordBoundary = candidate.lastIndexOf(" ");
    if (wordBoundary >= Math.floor(maximum * 0.68))
      return `${trimTrailingFragment(candidate.slice(0, wordBoundary))}…`;
  }

  return `${trimTrailingFragment(normalized.slice(0, maximum - 1))}…`;
}

function sourceLead(overview: string, locale: CatalogLocale): string {
  const paragraph = normalizeCopy(overview.split(/\n\s*\n/u)[0] ?? "");
  let lead =
    locale === "en"
      ? paragraph.replace(/^.+? is maintained from its public source\.\s*/iu, "")
      : paragraph.replace(/^.+?依据公开来源维护。\s*/u, "");

  if (locale === "zh") {
    const quoted = lead.match(/^公开 README 对用途的说明为：[“"](.+?)[”"]$/u);
    if (quoted?.[1]) lead = quoted[1];
    if (!/[\p{Script=Han}]/u.test(lead)) return "";
  }

  if (
    isLowInformationCatalogCopy(lead) ||
    /^The README describes .+ as a DeepSeek Harness plugin\. Its documented surface includes /iu.test(
      lead,
    )
  )
    return "";
  return lead;
}

export function improveShortDescription(
  current: string,
  overview: string,
  locale: CatalogLocale,
): string {
  const normalized = normalizeCopy(current);
  const recovered = sourceLead(overview, locale);
  const looksClipped = normalized.length >= 230 || /\b[A-Za-z]{1,3}$/u.test(normalized);
  const preferred = looksClipped && recovered.length >= normalized.length ? recovered : normalized;
  return truncateCatalogCopy(preferred, locale === "en" ? 220 : 160, locale);
}

export function buildPluginSeoTitle(displayName: string, locale: CatalogLocale): string {
  const suffix = createTranslator(locale)("catalog.seoTitleSuffix");
  const maximum = locale === "en" ? 68 : 64;
  const available = maximum - suffix.length;
  return `${truncateCatalogCopy(displayName, available, locale)}${suffix}`;
}

export function buildPluginSeoDescription(description: string, locale: CatalogLocale): string {
  const normalized = normalizeCopy(description);
  const ecosystem = /\b(?:DSH|DeepSeek Harness)\b/iu.test(normalized);
  const suffix = ecosystem ? "" : createTranslator(locale)("catalog.seoDescriptionSuffix");
  const maximum = locale === "en" ? 160 : 96;
  const body = truncateCatalogCopy(normalized, maximum - suffix.length - 1, locale);
  return `${trimTrailingFragment(body)}${suffix}`;
}

export function buildPluginOverview(input: {
  readonly description: string;
  readonly previousOverview: string;
  readonly installCommand: string | null;
  readonly locale: CatalogLocale;
  readonly hasReadme: boolean;
}): string {
  const lead = truncateCatalogCopy(
    sourceLead(input.previousOverview, input.locale) || normalizeCopy(input.description),
    6_500,
    input.locale,
  );
  const t = createTranslator(input.locale);
  const installation = input.installCommand
    ? t("catalog.overviewInstall", { command: input.installCommand })
    : t("catalog.overviewInstallMissing");
  const provenance = t(
    input.hasReadme ? "catalog.overviewSourceReadme" : "catalog.overviewSourceMetadata",
  );
  return [lead, installation, provenance].join("\n\n");
}
