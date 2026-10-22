import { sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { describeError } from "@/lib/error-logging";

import { assessPrimaryTargets, type InstallTargetInput } from "./install-target/policy";
import { refreshPluginScores } from "./scores.server";

/**
 * One row per published plugin, written only here. Readers use
 * `installReadySql` instead of re-deriving the rule from
 * `plugin_install_targets`.
 */
// Three bound parameters per row in the upsert, under D1's cap of 100 bound
// parameters per statement.
const READINESS_ID_CHUNK_SIZE = 25;
const READINESS_SELF_HEAL_INTERVAL_MS = 5 * 60_000;

let lastReadinessCheckAt = 0;

type ReadinessPluginRow = {
  id: string;
  package_name: string;
  latest_version: string;
  full_name: string | null;
};

type ReadinessTargetRow = {
  plugin_id: string;
  kind: string;
  spec: string;
  package_name: string | null;
  version: string | null;
  is_primary: number;
  status: string;
};

function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    output.push(values.slice(index, index + size));
  return output;
}

async function refreshGroup(
  db: Database,
  ids: readonly string[],
  computedAt: number,
): Promise<void> {
  const plugins = await db.all<ReadinessPluginRow>(sql`
    select p.id, p.package_name, p.latest_version, repository.full_name
    from plugins p
    left join repositories repository on repository.id = p.primary_repository_id
    where p.status = 'published'
      and p.id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
  `);
  if (plugins.length === 0) return;

  const targets = await db.all<ReadinessTargetRow>(sql`
    select plugin_id, kind, spec, package_name, version, is_primary, status
    from plugin_install_targets
    where plugin_id in (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})
  `);

  const targetsByPlugin = new Map<string, InstallTargetInput[]>();
  for (const target of targets) {
    const list = targetsByPlugin.get(target.plugin_id) ?? [];
    list.push({
      kind: target.kind,
      spec: target.spec,
      packageName: target.package_name,
      version: target.version,
      primary: target.is_primary === 1,
      available: target.status === "active",
    });
    targetsByPlugin.set(target.plugin_id, list);
  }

  const values = plugins.map((plugin) => {
    const verdict = assessPrimaryTargets(targetsByPlugin.get(plugin.id) ?? [], {
      packageName: plugin.package_name,
      version: plugin.latest_version,
      repositoryFullName: plugin.full_name,
    });
    return sql`(${plugin.id}, ${verdict.ok ? 1 : 0}, ${computedAt})`;
  });

  await db.run(sql`
    insert into plugin_readiness(plugin_id, install_ready, computed_at)
    values ${sql.join(values, sql`, `)}
    on conflict(plugin_id) do update set
      install_ready = excluded.install_ready,
      computed_at = excluded.computed_at
  `);
}

async function publishedPluginIds(db: Database): Promise<string[]> {
  const rows = await db.all<{ id: string }>(sql`select id from plugins where status = 'published'`);
  return rows.map((row) => row.id);
}

/**
 * Recomputes the stored verdict for the given plugins, or for the published
 * catalog. Callers are the paths that can change what the catalog offers: an
 * observation batch, curation (which can publish), and the visibility
 * transition that can restore a previously hidden plugin.
 */
export async function refreshInstallReadiness(
  db: Database,
  options: { pluginIds?: readonly string[] } = {},
): Promise<void> {
  const requested = options.pluginIds ? [...new Set(options.pluginIds)] : null;
  if (requested && requested.length === 0) return;
  // D1 caps bound parameters per statement, so even a whole-catalog backfill
  // is reduced to a list of ids and walked in chunks.
  const ids: string[] = requested ?? (await publishedPluginIds(db));
  const computedAt = Date.now();
  // Sequential on purpose: a backfill must not fan out one D1 batch per chunk
  // at the same time.
  for (const group of chunks(ids, READINESS_ID_CHUNK_SIZE))
    await refreshGroup(db, group, computedAt);
}

/**
 * Recomputes one plugin's verdict after its facts changed. Failures are
 * logged rather than thrown: the write that triggered the refresh has already
 * committed, and readers treat a missing row as "not ready".
 */
export async function refreshPluginReadiness(db: Database, pluginId: string): Promise<void> {
  try {
    await refreshInstallReadiness(db, { pluginIds: [pluginId] });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Install readiness refresh failed",
        pluginId,
        error: describeError(error),
      }),
    );
  }
}

async function backfillMissingReadiness(db: Database): Promise<void> {
  const missing = await db.get(sql`
    select 1 as missing
    from plugins p
    left join plugin_readiness readiness on readiness.plugin_id = p.id
    where p.status = 'published' and readiness.plugin_id is null
    limit 1
  `);
  if (!missing) return;
  await refreshInstallReadiness(db);
  // Stored quality bases were computed before this plugin had a verdict (and,
  // on the first deploy, under the old marketplace rule); recompute them so a
  // repaired row and the score it feeds cannot disagree.
  await refreshPluginScores(db);
}

/**
 * Repairs rows that predate the table (or a refresh that failed). Unlike the
 * score projection there is no live fallback to read, so a marketplace reader
 * waits for the first repair instead of rendering an empty catalog; later
 * requests skip the check for the rest of the interval.
 */
export async function ensureInstallReadiness(db: Database): Promise<void> {
  const now = Date.now();
  if (now - lastReadinessCheckAt < READINESS_SELF_HEAL_INTERVAL_MS) return;
  lastReadinessCheckAt = now;
  await backfillMissingReadiness(db).catch((error: unknown) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Install readiness backfill failed",
        error: describeError(error),
      }),
    );
  });
}
