import type { OpsPluginListQuery } from "@becomeopc/dshx-hub-contracts";
/**
 * What the operations API reads back about plugins.
 *
 * The list, the detail and the status summary all answer from the same rows and
 * the same policy: `policy.ts` says when a plugin is stale, risky or missing
 * something, and these adapters only decide what to query and how to page. A
 * plugin whose row state and policy disagree is a bug here, not a rule to
 * duplicate.
 */

import type { Database } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";

import { isWeakCuration, weakCurationSql } from "../../curation-policy";
import { decodeCursor, encodeCursor } from "../../cursor";
import type { JsonRecord } from "../../json";
import { OperationHttpError, requireCursor } from "../../operations-v1.http";
import type { SourceSummary } from "../observation/merge";
import {
  fallbackOperationalState,
  findOperationalState,
  findPlugin,
  parseJson,
  readCuration,
  readInstallTargets,
  readPluginIdentities,
  readPluginMedia,
  readRecentAudit,
  type OperationalRow,
  type PluginRow,
} from "../store";
import { needsFor, needsPrefilterSql, riskSignals } from "./policy";

type OpsListRow = PluginRow &
  OperationalRow & {
    has_curation: number;
    source_readme_hash: string | null;
    curation_low_quality: number;
    ready_locale_count: number;
    unavailable_target_count: number;
    identity_conflict: number;
  };

function summarizePluginRow(row: OpsListRow) {
  const facts = parseJson<JsonRecord>(row.facts_json, {});
  const sources = parseJson<SourceSummary[]>(row.sources_json, []);
  const curation =
    row.has_curation === 1
      ? {
          ...(row.source_readme_hash ? { sourceReadmeHash: row.source_readme_hash } : {}),
          ...(row.curation_low_quality === 1 ? { lowQuality: true } : {}),
        }
      : row.ready_locale_count >= 2
        ? {}
        : null;
  const risks = riskSignals(facts, sources, {
    hasContent: Boolean(curation),
    identityConflict: row.identity_conflict === 1,
    unavailableTargetCount: row.unavailable_target_count,
  });
  const needs = needsFor(facts, sources, curation, risks);
  const publicState: "hidden" | "draft" | "published" =
    row.visibility === "hidden" ? "hidden" : row.state;
  return {
    id: row.id,
    slug: row.slug,
    identity: row.identity_key,
    state: publicState,
    visibility: row.visibility,
    revision: row.revision,
    lastObservedAt: row.last_observed_at ? new Date(row.last_observed_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
    needs,
    riskSignals: risks,
    sources,
  };
}

async function scanPluginRows(
  binding: Database,
  start: [number, string] | null,
  limit: number,
  needs: OpsPluginListQuery["needs"],
) {
  const prefilter = needsPrefilterSql(needs);
  return binding.all<OpsListRow>(
    parameterizedSql(
      `with conflicting_package_names as (
        select json_extract(facts_json,'$.package.name') package_name
        from plugin_operational_state
        where json_extract(facts_json,'$.package.name') is not null
        group by json_extract(facts_json,'$.package.name')
        having count(*)>1
      )
       select p.id,p.slug,p.identity_key,p.package_name,p.name,p.description,p.author_handle,
        p.category,p.latest_version,p.compatibility_range,p.status,p.lifecycle_status,
        p.repository_url,p.homepage_url,p.license_spdx,p.created_at,
        o.plugin_id,o.state,o.visibility,o.revision,o.detection_json,o.facts_json,o.sources_json,
        o.field_provenance_json,o.visibility_reason,o.visibility_changed_at,o.last_observed_at,
        o.created_at operational_created_at,o.updated_at,
        case when c.plugin_id is null then 0 else 1 end has_curation,
        c.source_readme_hash,
        case when c.plugin_id is null then 0 when ${weakCurationSql} then 1 else 0 end curation_low_quality,
        (select count(*) from plugin_localizations l where l.plugin_id=p.id and l.translation_status='ready') ready_locale_count,
        (select count(*) from plugin_install_targets t where t.plugin_id=p.id and t.status='unavailable') unavailable_target_count,
        case when conflicts.package_name is null then 0 else 1 end identity_conflict
       from plugins p join plugin_operational_state o on o.plugin_id=p.id
       left join plugin_curations c on c.plugin_id=p.id
       left join conflicting_package_names conflicts
         on conflicts.package_name=json_extract(o.facts_json,'$.package.name')
       where (? is null or o.updated_at < ? or (o.updated_at=? and p.id<?))
         and ${prefilter.condition}
       order by o.updated_at desc,p.id desc limit ?`,
      [
        start?.[0] ?? null,
        start?.[0] ?? null,
        start?.[0] ?? null,
        start?.[1] ?? null,
        ...prefilter.parameters,
        limit,
      ],
    ),
  );
}

export async function listOpsPlugins(binding: Database, query: OpsPluginListQuery) {
  let scanCursor = requireCursor(decodeCursor(query.cursor, ["timestamp", "text"]));
  const matches: Array<ReturnType<typeof summarizePluginRow>> = [];
  let exhausted = false;
  while (matches.length <= query.limit && !exhausted) {
    const page = await scanPluginRows(
      binding,
      scanCursor,
      Math.max(100, query.limit * 2),
      query.needs,
    );
    const rows = page;
    exhausted = rows.length < Math.max(100, query.limit * 2);
    for (const row of rows) {
      scanCursor = [row.updated_at, row.id];
      const item = summarizePluginRow(row);
      if (query.state?.length && !query.state.includes(item.state)) continue;
      if (query.needs?.length && !query.needs.some((need) => item.needs.includes(need))) continue;
      if (
        query.source?.length &&
        !query.source.some((kind) => item.sources.some((source) => source.kind === kind))
      )
        continue;
      if (query.risk?.length && !query.risk.some((risk) => item.riskSignals.includes(risk)))
        continue;
      if (
        query.observedBefore &&
        item.lastObservedAt &&
        Date.parse(item.lastObservedAt) >= Date.parse(query.observedBefore)
      )
        continue;
      if (query.observedBefore && !item.lastObservedAt) continue;
      if (query.updatedBefore && Date.parse(item.updatedAt) >= Date.parse(query.updatedBefore))
        continue;
      matches.push(item);
      if (matches.length > query.limit) break;
    }
    if (!rows.length) exhausted = true;
  }
  const items = matches.slice(0, query.limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      matches.length > query.limit && last
        ? encodeCursor([Date.parse(last.updatedAt), last.id])
        : null,
  };
}

export async function getOpsPlugin(binding: Database, idOrSlug: string) {
  const plugin = await findPlugin(binding, idOrSlug);
  if (!plugin)
    throw new OperationHttpError(404, "plugin_not_found", "Plugin not found", false, {
      repairHint: "Run plugin list to resolve the current plugin id or slug.",
    });
  const state = (await findOperationalState(binding, plugin)) ?? fallbackOperationalState(plugin);
  const facts = parseJson<JsonRecord>(state.facts_json, {});
  const sources = parseJson<SourceSummary[]>(state.sources_json, []);
  const storedCuration = await readCuration(binding, plugin.id);
  const curation = storedCuration
    ? {
        ...storedCuration,
        ...(isWeakCuration(storedCuration, {
          slug: plugin.slug,
          name: plugin.name,
          packageName: plugin.package_name,
        })
          ? { lowQuality: true }
          : {}),
      }
    : null;
  const [identities, targets, media, audit] = await Promise.all([
    readPluginIdentities(binding, plugin.id),
    readInstallTargets(binding, plugin.id),
    readPluginMedia(binding, plugin.id),
    readRecentAudit(binding, plugin.id),
  ]);
  const unavailableTargets = targets.filter((target) => target["status"] === "unavailable");
  const risks = riskSignals(facts, sources, {
    hasContent: Boolean(curation),
    unavailableTargetCount: unavailableTargets.length,
  });
  return {
    id: plugin.id,
    slug: plugin.slug,
    identity: plugin.identity_key,
    identities: identities.map((entry) => ({
      key: entry.identity_key,
      ...parseJson(entry.identity_json, { kind: entry.kind }),
    })),
    state: state.state,
    visibility: {
      state: state.visibility,
      reason: state.visibility_reason,
      changedAt: state.visibility_changed_at
        ? new Date(state.visibility_changed_at).toISOString()
        : null,
    },
    revision: state.revision,
    lastObservedAt: state.last_observed_at ? new Date(state.last_observed_at).toISOString() : null,
    evidence: parseJson(state.detection_json, null),
    sources,
    facts,
    installTargets:
      Array.isArray(facts["installTargets"]) && facts["installTargets"].length
        ? facts["installTargets"]
        : targets.map((target) => ({
            ...target,
            primary: Boolean(target["isPrimary"]),
            available: target["status"] !== "unavailable",
            observedAt: target["observedAt"]
              ? new Date(Number(target["observedAt"])).toISOString()
              : null,
          })),
    curation,
    riskSignals: risks,
    needs: needsFor(facts, sources, curation, risks),
    media: media.map((entry) => ({
      ...entry,
      altText: parseJson(entry["altText"], {}),
      createdAt: new Date(Number(entry["createdAt"])).toISOString(),
    })),
    recentAudit: audit.map((entry) => ({
      ...entry,
      details: parseJson(entry["details"], {}),
      createdAt: new Date(Number(entry["createdAt"])).toISOString(),
    })),
  };
}

export async function getOpsStatus(
  binding: Database,
  auth: { authenticated: boolean; scopes: string[] },
) {
  const rows = await binding.all<{
    state: "draft" | "published";
    visibility: "visible" | "hidden";
    facts_json: string;
    sources_json: string;
    has_curation: number;
    source_readme_hash: string | null;
    curation_low_quality: number;
    ready_locale_count: number;
    identity_conflict: number;
  }>(
    parameterizedSql(
      `with ready_localizations as (
        select plugin_id,count(*) ready_locale_count
        from plugin_localizations where translation_status='ready'
        group by plugin_id
      ), identity_conflicts as (
        select json_extract(facts_json,'$.package.name') package_name
        from plugin_operational_state
        where json_extract(facts_json,'$.package.name') is not null
        group by package_name having count(*)>1
      )
      select o.state,o.visibility,o.facts_json,o.sources_json,
        case when c.plugin_id is null then 0 else 1 end has_curation,
        c.source_readme_hash,
        case when c.plugin_id is null then 0 when ${weakCurationSql} then 1 else 0 end curation_low_quality,
        coalesce(l.ready_locale_count,0) ready_locale_count,
        case when conflicts.package_name is null then 0 else 1 end identity_conflict
      from plugin_operational_state o
      left join plugins p on p.id=o.plugin_id
      left join plugin_curations c on c.plugin_id=o.plugin_id
      left join ready_localizations l on l.plugin_id=o.plugin_id
      left join identity_conflicts conflicts
        on conflicts.package_name=json_extract(o.facts_json,'$.package.name')`,
      [],
    ),
  );
  const items = rows.map((row) => {
    const facts = parseJson<JsonRecord>(row.facts_json, {});
    const sources = parseJson<SourceSummary[]>(row.sources_json, []);
    const curation =
      row.has_curation === 1
        ? {
            ...(row.source_readme_hash ? { sourceReadmeHash: row.source_readme_hash } : {}),
            ...(row.curation_low_quality === 1 ? { lowQuality: true } : {}),
          }
        : row.ready_locale_count >= 2
          ? {}
          : null;
    return {
      state: row.visibility === "hidden" ? "hidden" : row.state,
      visibility: row.visibility,
      needs: needsFor(
        facts,
        sources,
        curation,
        row.identity_conflict === 1 ? ["identity-conflict"] : [],
      ),
      sources,
    };
  });
  const submissions = await binding.get<{ count: number }>(
    parameterizedSql("select count(*) count from plugin_submissions where status='queued'", []),
  );
  return {
    hub: { reachable: true, version: "ops-v1" },
    auth,
    catalog: {
      plugins: items.length,
      published: items.filter((item) => item.state === "published").length,
      drafts: items.filter((item) => item.state === "draft").length,
      hidden: items.filter((item) => item.visibility === "hidden").length,
      needsRefresh: items.filter((item) => item.needs.includes("refresh")).length,
      needsContent: items.filter((item) => item.needs.includes("content")).length,
      needsReadme: items.filter((item) => item.needs.includes("readme")).length,
      needsPublisher: items.filter((item) => item.needs.includes("publisher")).length,
      needsMetadata: items.filter((item) => item.needs.includes("metadata")).length,
      needsTarget: items.filter((item) => item.needs.includes("target")).length,
      sourceFailures: items.filter((item) =>
        item.sources.some((source) => source.availability === "unavailable"),
      ).length,
    },
    submissions: { queued: submissions?.count ?? 0 },
  };
}
