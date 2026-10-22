/**
 * The consistency sweep behind `GET /api/ops/v1/audit`.
 *
 * Each scope is a list of questions the catalog should always answer "none" to:
 * duplicate identities, orphaned observations, stale sources, missing search
 * rows, broken media. The checks that already have a policy module ask it
 * (`sourceStale`) instead of restating the threshold.
 */

import type { Database } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";

import type { JsonRecord } from "../json";
import type { SourceSummary } from "./observation/merge";
import { sourceStale } from "./plugins/policy";
import { parseJson } from "./store";

type AuditIssue = {
  code: string;
  severity: "critical" | "warning";
  count: number;
  sampleIds: string[];
};

function issue(code: string, severity: AuditIssue["severity"], ids: string[]): AuditIssue | null {
  return ids.length ? { code, severity, count: ids.length, sampleIds: ids.slice(0, 20) } : null;
}

/** The catalog's own consistency: identities, sources, search, relationships. */
async function catalogIssues(binding: Database): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  const states = await binding.all<{
    plugin_id: string;
    state: "draft" | "published";
    facts_json: string;
    sources_json: string;
    last_observed_at: number | null;
  }>(
    parameterizedSql(
      "select plugin_id,state,facts_json,sources_json,last_observed_at from plugin_operational_state",
      [],
    ),
  );
  const invalidUrls: string[] = [];
  const stale: string[] = [];
  const unavailableTargets: string[] = [];
  const relationErrors: string[] = [];
  for (const row of states) {
    const sources = parseJson<SourceSummary[]>(row.sources_json, []);
    if (sourceStale(sources)) stale.push(row.plugin_id);
    for (const source of sources) {
      try {
        new URL(source.url);
      } catch {
        invalidUrls.push(row.plugin_id);
      }
    }
    const facts = parseJson<JsonRecord>(row.facts_json, {});
    const targets = Array.isArray(facts["installTargets"])
      ? (facts["installTargets"] as JsonRecord[])
      : [];
    if (targets.some((target) => target["available"] === false))
      unavailableTargets.push(row.plugin_id);
    if (row.state === "published" && !parseJson(row.facts_json, null))
      relationErrors.push(row.plugin_id);
  }
  const duplicates = await binding.all<{ value: string }>(
    parameterizedSql(
      `select json_extract(facts_json,'$.package.name') value from plugin_operational_state
         where json_extract(facts_json,'$.package.name') is not null
         group by json_extract(facts_json,'$.package.name') having count(*)>1`,
      [],
    ),
  );
  const orphanObservations = await binding.all<{ id: string }>(
    parameterizedSql(
      `select o.observation_id id from plugin_observations o
         left join plugins p on p.id=o.plugin_id where p.id is null`,
      [],
    ),
  );
  const missingSearch = await binding.all<{ id: string }>(
    parameterizedSql(
      `select l.plugin_id||':'||l.locale id from plugin_localizations l
         left join plugin_search s on s.plugin_id=l.plugin_id and s.locale=l.locale
         where l.translation_status='ready' and s.plugin_id is null`,
      [],
    ),
  );
  for (const entry of [
    issue(
      "identity.duplicate",
      "critical",
      duplicates.map((row) => row.value),
    ),
    issue(
      "source.orphaned",
      "critical",
      orphanObservations.map((row) => row.id),
    ),
    issue("source.invalid_url", "critical", invalidUrls),
    issue("source.stale", "warning", stale),
    issue("install_target.unavailable", "warning", unavailableTargets),
    issue(
      "search.index_missing",
      "warning",
      missingSearch.map((row) => row.id),
    ),
    issue("catalog.relationship_invalid", "critical", relationErrors),
  ])
    if (entry) issues.push(entry);
  return issues;
}

/** Media rows whose object or hash no longer matches what is recorded. */
async function storageIssues(
  binding: Database,
  bucket: R2Bucket | undefined,
): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  const media = await binding.all<{ id: string; r2_key: string; sha256: string }>(
    parameterizedSql("select id,r2_key,sha256 from plugin_media where status='active'", []),
  );
  const missing: string[] = [];
  const invalidHash = media
    .filter((entry) => !/^[a-f0-9]{64}$/.test(entry.sha256))
    .map((entry) => entry.id);
  if (!bucket) missing.push(...media.map((entry) => entry.id));
  if (bucket)
    for (const entry of media) if (!(await bucket.head(entry.r2_key))) missing.push(entry.id);
  const missingAlt = await binding.all<{ id: string }>(
    parameterizedSql(
      `select m.id from plugin_media m cross join (select 'en' locale union all select 'zh') wanted
         left join plugin_media_localizations l on l.media_id=m.id and l.locale=wanted.locale
         where m.status='active' and (l.media_id is null or trim(l.alt_text)='')`,
      [],
    ),
  );
  for (const entry of [
    issue("media.ref_broken", "critical", missing),
    issue("media.hash_invalid", "critical", invalidHash),
    issue(
      "media.alt_missing",
      "warning",
      missingAlt.map((row) => row.id),
    ),
  ])
    if (entry) issues.push(entry);
  return issues;
}

/** Reports that point at something deleted, or were never answered. */
async function communityIssues(binding: Database): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  const orphanReports = await binding.all<{ id: string }>(
    parameterizedSql(
      `select r.id from content_reports r
         where (r.target_type='plugin' and not exists(select 1 from plugins p where p.id=r.target_id))
            or (r.target_type='review' and not exists(select 1 from plugin_reviews p where p.id=r.target_id))
            or (r.target_type='reply' and not exists(select 1 from review_replies p where p.id=r.target_id))`,
      [],
    ),
  );
  const unresolved = await binding.all<{ id: string }>(
    parameterizedSql(
      "select id from content_reports where status='open' and created_at<(unixepoch()-604800)*1000",
      [],
    ),
  );
  for (const entry of [
    issue(
      "community.relationship_invalid",
      "critical",
      orphanReports.map((row) => row.id),
    ),
    issue(
      "community.report_stale",
      "warning",
      unresolved.map((row) => row.id),
    ),
  ])
    if (entry) issues.push(entry);
  return issues;
}

export async function auditOperations(
  binding: Database,
  bucket: R2Bucket | undefined,
  scope: "catalog" | "storage" | "community",
) {
  const issues =
    scope === "catalog"
      ? await catalogIssues(binding)
      : scope === "storage"
        ? await storageIssues(binding, bucket)
        : await communityIssues(binding);
  return {
    scope,
    checkedAt: new Date().toISOString(),
    issues,
    summary: {
      critical: issues.filter((entry) => entry.severity === "critical").length,
      warnings: issues.filter((entry) => entry.severity === "warning").length,
    },
  };
}
