import type { OpsPluginListQuery } from "@becomeopc/dshx-hub-contracts";
/**
 * When a plugin is public, stale, or still needs work.
 *
 * Three adapters ask these questions: the ops list (which has to filter in SQL
 * before pagination), the ops detail and status (which read the same rows in
 * TypeScript), and the two writes that publish or hide a plugin. The rules and
 * their constants live here so those adapters cannot drift apart; the SQL
 * prefilter is the projection of `needsFor`, not a second opinion.
 */

import { satisfies, validRange } from "semver";

import { weakCurationSql } from "../../curation-policy";
import { jsonRecord, type JsonRecord } from "../../json";
import type { SourceSummary } from "../observation/merge";

export const SOURCE_STALE_MS = 30 * 86_400_000;

/**
 * "unavailable" describes one observation, not the repository. The fetch can
 * fail transiently, a README can be added later, or a repository can be made
 * public after the fact. Let the fact expire so operators can see the entry and
 * re-inspect it instead of leaving the page permanently out of the index.
 */
export const README_RECHECK_MS = 14 * 86_400_000;

/** The harness version this Hub judges a declared range against. */
export const CURRENT_DSH_VERSION = "0.2.1-rc.2";

export type PluginNeed = NonNullable<OpsPluginListQuery["needs"]>[number];
/** The closed vocabulary a projection may report, so the API contract can name it. */
export type PluginRisk = NonNullable<OpsPluginListQuery["risk"]>[number];

export function sourceStale(sources: readonly SourceSummary[], now = Date.now()): boolean {
  return (
    sources.length === 0 ||
    sources.every((source) => now - Date.parse(source.lastObservedAt) > SOURCE_STALE_MS)
  );
}

export function observedAtMs(sources: readonly SourceSummary[]): number {
  return sources.reduce((latest, source) => {
    const value = Date.parse(source.lastObservedAt);
    return Number.isFinite(value) && value > latest ? value : latest;
  }, Number.NEGATIVE_INFINITY);
}

export function readmeNeedsRecheck(
  readme: JsonRecord,
  sources: readonly SourceSummary[],
  now = Date.now(),
): boolean {
  const availability = String(readme["availability"] ?? "");
  if (availability === "available") return false;
  if (availability !== "unavailable") return true;
  const observed = observedAtMs(sources);
  return !Number.isFinite(observed) || now - observed > README_RECHECK_MS;
}

export type RiskSignalContext = {
  readonly hasContent: boolean;
  readonly identityConflict?: boolean;
  readonly unavailableTargetCount?: number;
  readonly now?: number;
};

export function riskSignals(
  facts: JsonRecord,
  sources: readonly SourceSummary[],
  {
    hasContent,
    identityConflict = false,
    unavailableTargetCount = 0,
    now = Date.now(),
  }: RiskSignalContext,
): PluginRisk[] {
  const risks = new Set<PluginRisk>(["runtime-not-verified"]);
  const compatibility = jsonRecord(facts["compatibility"]);
  const declared =
    typeof compatibility["declaredRange"] === "string" ? compatibility["declaredRange"].trim() : "";
  if (!declared || declared === "*") risks.add("compatibility-not-declared");
  else if (
    !validRange(declared, { includePrerelease: true }) ||
    !satisfies(CURRENT_DSH_VERSION, declared, { includePrerelease: true })
  )
    risks.add("declared-range-mismatch");
  const repository = jsonRecord(facts["repository"]);
  const packageFacts = jsonRecord(facts["package"]);
  if (repository["archived"] === true) risks.add("repository-archived");
  if (repository["disabled"] === true) risks.add("repository-disabled");
  if (packageFacts["deprecated"] === true) risks.add("package-deprecated");
  const targets = Array.isArray(facts["installTargets"])
    ? (facts["installTargets"] as JsonRecord[])
    : [];
  if (unavailableTargetCount > 0 || targets.some((target) => target["available"] === false))
    risks.add("install-target-unavailable");
  if (sourceStale(sources, now)) risks.add("source-stale");
  if (
    !hasContent ||
    typeof packageFacts["name"] !== "string" ||
    typeof packageFacts["version"] !== "string" ||
    (typeof packageFacts["repositoryUrl"] !== "string" &&
      typeof repository["fullName"] !== "string")
  )
    risks.add("metadata-incomplete");
  if (identityConflict) risks.add("identity-conflict");
  return [...risks].sort();
}

/**
 * What an operator still has to do. `curation` is whatever the caller has on
 * hand — the stored row, its two projected flags, `{}` for localized content
 * that was never curated, or null when there is none.
 */
export function needsFor(
  facts: JsonRecord,
  sources: readonly SourceSummary[],
  curation: unknown,
  risks: readonly string[],
  now = Date.now(),
): PluginNeed[] {
  const needs: PluginNeed[] = [];
  const curationFacts = jsonRecord(curation);
  if (sourceStale(sources, now)) needs.push("refresh");
  const readme = jsonRecord(facts["readme"]);
  const publicSourceObserved = sources.some(
    (source) => source.kind === "github" || source.kind === "npm",
  );
  if (publicSourceObserved && readmeNeedsRecheck(readme, sources, now)) needs.push("readme");
  if (
    !curation ||
    curationFacts["lowQuality"] === true ||
    (readme["availability"] === "available" &&
      typeof readme["contentHash"] === "string" &&
      curationFacts["sourceReadmeHash"] !== readme["contentHash"])
  )
    needs.push("content");
  if (sources.length === 0 || sources.every((source) => source.availability === "unavailable"))
    needs.push("source");
  const packageFacts = jsonRecord(facts["package"]);
  const repository = jsonRecord(facts["repository"]);
  const publisher = jsonRecord(facts["publisher"]);
  if (
    typeof repository["fullName"] === "string" &&
    (typeof publisher["githubId"] !== "string" ||
      typeof publisher["avatarUrl"] !== "string" ||
      typeof publisher["profileUrl"] !== "string")
  )
    needs.push("publisher");
  if (
    typeof packageFacts["name"] !== "string" ||
    typeof packageFacts["version"] !== "string" ||
    risks.includes("identity-conflict")
  )
    needs.push("metadata");
  const targets = Array.isArray(facts["installTargets"])
    ? (facts["installTargets"] as JsonRecord[])
    : [];
  if (
    targets.filter((target) => target["primary"] === true && target["available"] !== false)
      .length !== 1
  )
    needs.push("target");
  return needs;
}

/**
 * `needsFor` projected into SQL, for the list that has to filter before
 * pagination. The condition is deliberately a superset: rows that match none
 * of the requested needs are skipped, and the caller re-checks every row it
 * reads. Expects `o` (plugin_operational_state), `c` (plugin_curations), and
 * `conflicts` (duplicate package names) in scope.
 */
export function needsPrefilterSql(
  needs: readonly PluginNeed[] | undefined,
  now = Date.now(),
): { condition: string; parameters: unknown[] } {
  if (!needs?.length) return { condition: "1=1", parameters: [] };
  const parameters: unknown[] = [];
  const conditions = needs.map((need) => {
    switch (need) {
      case "refresh":
        parameters.push(new Date(now - SOURCE_STALE_MS).toISOString());
        return `(json_array_length(o.sources_json)=0 or not exists(
          select 1 from json_each(o.sources_json) source
          where json_extract(source.value,'$.lastObservedAt')>=?
        ))`;
      case "readme":
        parameters.push(new Date(now - README_RECHECK_MS).toISOString());
        return `(exists(
          select 1 from json_each(o.sources_json) source
          where json_extract(source.value,'$.kind') in ('github','npm')
        ) and (
          coalesce(json_extract(o.facts_json,'$.readme.availability'),'')
            not in ('available','unavailable')
          or (json_extract(o.facts_json,'$.readme.availability')='unavailable'
            and not exists(
              select 1 from json_each(o.sources_json) source
              where json_extract(source.value,'$.lastObservedAt')>=?
            ))
        ))`;
      case "content":
        return `(c.plugin_id is null or ${weakCurationSql} or (
          json_extract(o.facts_json,'$.readme.availability')='available'
          and json_type(o.facts_json,'$.readme.contentHash')='text'
          and c.source_readme_hash is not json_extract(o.facts_json,'$.readme.contentHash')
        ))`;
      case "source":
        return `(json_array_length(o.sources_json)=0 or not exists(
          select 1 from json_each(o.sources_json) source
          where coalesce(json_extract(source.value,'$.availability'),'')<>'unavailable'
        ))`;
      case "publisher":
        return `(json_type(o.facts_json,'$.repository.fullName')='text' and (
          coalesce(json_type(o.facts_json,'$.publisher.githubId'),'')<>'text'
          or coalesce(json_type(o.facts_json,'$.publisher.avatarUrl'),'')<>'text'
          or coalesce(json_type(o.facts_json,'$.publisher.profileUrl'),'')<>'text'
        ))`;
      case "metadata":
        return `(coalesce(json_type(o.facts_json,'$.package.name'),'')<>'text'
          or coalesce(json_type(o.facts_json,'$.package.version'),'')<>'text'
          or conflicts.package_name is not null)`;
      case "target":
        return `((select count(*) from json_each(
          coalesce(json_extract(o.facts_json,'$.installTargets'),'[]')
        ) target where json_extract(target.value,'$.primary')=1
          and coalesce(json_extract(target.value,'$.available'),1)<>0)<>1)`;
    }
  });
  return { condition: `(${conditions.join(" or ")})`, parameters };
}

export type PluginStatus = "draft" | "published" | "archived";

/**
 * The `plugins.status` that matches the operational state. Hiding wins over
 * everything; a plugin the operation state considers published is only public
 * while it has curated copy, because every public page renders the curation.
 */
export function pluginStatusFor(
  state: "draft" | "published",
  visibility: "visible" | "hidden",
  hasCuration: boolean,
): PluginStatus {
  if (visibility === "hidden") return "archived";
  return state === "published" && hasCuration ? "published" : "draft";
}
