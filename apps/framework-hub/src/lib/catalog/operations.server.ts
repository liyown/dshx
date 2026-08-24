import { sql } from "drizzle-orm";

import type { MetricSnapshot } from "./contracts";
import type { Database } from "@/lib/db/client";
import { HttpError } from "@/lib/http";

type InventoryQuery = { cursor?: string | null | undefined; limit: number };

type InventoryRow = {
  id: string;
  slug: string;
  identity_key: string;
  lifecycle_status: string;
  updated_at: number;
  repository_github_id: string | null;
  repository_full_name: string | null;
  repository_default_branch: string | null;
  repository_content_hash: string | null;
  repository_package_id: string | null;
  subdirectory: string | null;
  package_name: string;
  package_version: string | null;
  qualification_status: string | null;
  consecutive_failures: number | null;
  validation_summary_json: string | null;
  install_kind: string | null;
  install_spec: string | null;
  integrity: string | null;
  latest_metric_date: string | null;
  github_stars: number | null;
  github_forks: number | null;
  github_open_issues: number | null;
  npm_downloads_day: number | null;
  npm_downloads_week: number | null;
};

function encodeCursor(updatedAt: number, id: string): string {
  return btoa(JSON.stringify([updatedAt, id]))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeCursor(value?: string | null): [number, string] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/"))) as unknown;
    return Array.isArray(parsed) && typeof parsed[0] === "number" && typeof parsed[1] === "string"
      ? [parsed[0], parsed[1]]
      : null;
  } catch {
    return null;
  }
}

export async function listCatalogInventory(db: Database, query: InventoryQuery) {
  const cursor = decodeCursor(query.cursor);
  if (query.cursor && !cursor)
    throw new HttpError(422, "Invalid inventory cursor", "invalid_cursor");
  const cursorCondition = cursor
    ? sql`and (p.updated_at < ${cursor[0]} or (p.updated_at = ${cursor[0]} and p.id < ${cursor[1]}))`
    : sql``;
  const rows = await db.all<InventoryRow>(sql`
    select p.id,p.slug,p.identity_key,p.lifecycle_status,p.updated_at,
      r.github_id repository_github_id,r.full_name repository_full_name,
      r.default_branch repository_default_branch,r.content_hash repository_content_hash,
      rp.id repository_package_id,rp.subdirectory,p.package_name,rp.package_version,
      rp.qualification_status,rp.consecutive_failures,rp.validation_summary_json,
      it.kind install_kind,it.spec install_spec,it.integrity,
      (select max(snapshot_date) from plugin_metric_daily d where d.plugin_id=p.id) latest_metric_date,
      m.github_stars,m.github_forks,m.github_open_issues,m.npm_downloads_day,m.npm_downloads_week
    from plugins p
    left join repositories r on r.id=p.primary_repository_id
    left join repository_packages rp on rp.id=p.primary_repository_package_id
    left join plugin_install_targets it on it.plugin_id=p.id and it.is_primary=1
    left join plugin_metrics_current m on m.plugin_id=p.id
    where p.status='published' ${cursorCondition}
    order by p.updated_at desc,p.id desc
    limit ${query.limit + 1}
  `);
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      pluginId: row.id,
      slug: row.slug,
      identityKey: row.identity_key,
      lifecycleStatus: row.lifecycle_status,
      updatedAt: new Date(row.updated_at).toISOString(),
      repository: row.repository_github_id
        ? {
            githubId: row.repository_github_id,
            fullName: row.repository_full_name,
            defaultBranch: row.repository_default_branch,
            contentHash: row.repository_content_hash,
          }
        : null,
      repositoryPackage: row.repository_package_id
        ? {
            id: row.repository_package_id,
            subdirectory: row.subdirectory ?? "",
            packageName: row.package_name,
            version: row.package_version,
            qualificationStatus: row.qualification_status,
            consecutiveFailures: row.consecutive_failures ?? 0,
            validationSummary: row.validation_summary_json
              ? JSON.parse(row.validation_summary_json)
              : {},
          }
        : null,
      installTarget: row.install_kind
        ? {
            kind: row.install_kind,
            spec: row.install_spec,
            integrity: row.integrity,
          }
        : null,
      metrics: {
        latestSnapshotDate: row.latest_metric_date,
        githubStars: row.github_stars,
        githubForks: row.github_forks,
        githubOpenIssues: row.github_open_issues,
        npmDownloadsDay: row.npm_downloads_day,
        npmDownloadsWeek: row.npm_downloads_week,
      },
    })),
    nextCursor: hasMore && last ? encodeCursor(last.updated_at, last.id) : null,
  };
}

type HistoricalMetric = {
  github_stars: number;
  github_forks: number;
};

async function baseline(
  db: Database,
  pluginId: string,
  snapshotDate: string,
  days: 7 | 30,
): Promise<HistoricalMetric | undefined> {
  const target = `-${days} day`;
  const preferred = await db.get<HistoricalMetric>(sql`
    select github_stars,github_forks from plugin_metric_daily
    where plugin_id=${pluginId} and snapshot_date <= date(${snapshotDate},${target})
    order by snapshot_date desc limit 1
  `);
  if (preferred) return preferred;
  return db.get<HistoricalMetric>(sql`
    select github_stars,github_forks from plugin_metric_daily
    where plugin_id=${pluginId} and snapshot_date < ${snapshotDate}
    order by snapshot_date asc limit 1
  `);
}

function score(snapshot: MetricSnapshot, historical: HistoricalMetric | undefined, npm: number) {
  const stars = Math.max(
    snapshot.githubStars - (historical?.github_stars ?? snapshot.githubStars),
    0,
  );
  const forks = Math.max(
    snapshot.githubForks - (historical?.github_forks ?? snapshot.githubForks),
    0,
  );
  return 100 * stars + 25 * forks + Math.round(10 * Math.log1p(Math.max(npm, 0)));
}

export async function storeMetricSnapshots(
  binding: D1Database,
  db: Database,
  snapshots: MetricSnapshot[],
) {
  const pluginIds = [...new Set(snapshots.map((entry) => entry.pluginId))];
  const placeholders = pluginIds.map(() => "?").join(",");
  const found = await binding
    .prepare(`select id from plugins where id in (${placeholders})`)
    .bind(...pluginIds)
    .all<{ id: string }>();
  const foundIds = new Set((found.results ?? []).map((entry) => entry.id));
  const missing = pluginIds.filter((id) => !foundIds.has(id));
  if (missing.length)
    throw new HttpError(422, `Unknown plugin ids: ${missing.join(", ")}`, "unknown_plugins");

  const computed = [];
  for (const snapshot of snapshots) {
    const [baseline7, baseline30, downloads] = await Promise.all([
      baseline(db, snapshot.pluginId, snapshot.snapshotDate, 7),
      baseline(db, snapshot.pluginId, snapshot.snapshotDate, 30),
      db.get<{ total: number | null }>(sql`
        select sum(coalesce(npm_downloads_day,0)) total from plugin_metric_daily
        where plugin_id=${snapshot.pluginId}
          and snapshot_date >= date(${snapshot.snapshotDate},'-29 day')
          and snapshot_date < ${snapshot.snapshotDate}
      `),
    ]);
    const trendScore7d = score(snapshot, baseline7, snapshot.npmDownloadsWeek ?? 0);
    const trendScore30d = score(
      snapshot,
      baseline30,
      (downloads?.total ?? 0) + (snapshot.npmDownloadsDay ?? 0),
    );
    computed.push({ ...snapshot, trendScore7d, trendScore30d });
  }

  const statements = computed.flatMap((entry) => [
    binding
      .prepare(
        `insert into plugin_metric_daily(plugin_id,snapshot_date,github_stars,github_forks,github_open_issues,npm_downloads_day,npm_downloads_week,trend_score_7d,trend_score_30d,captured_at)
         values(?,?,?,?,?,?,?,?,?,unixepoch()*1000)
         on conflict(plugin_id,snapshot_date) do update set github_stars=excluded.github_stars,github_forks=excluded.github_forks,github_open_issues=excluded.github_open_issues,npm_downloads_day=excluded.npm_downloads_day,npm_downloads_week=excluded.npm_downloads_week,trend_score_7d=excluded.trend_score_7d,trend_score_30d=excluded.trend_score_30d,captured_at=excluded.captured_at`,
      )
      .bind(
        entry.pluginId,
        entry.snapshotDate,
        entry.githubStars,
        entry.githubForks,
        entry.githubOpenIssues,
        entry.npmDownloadsDay ?? null,
        entry.npmDownloadsWeek ?? null,
        entry.trendScore7d,
        entry.trendScore30d,
      ),
    binding
      .prepare(
        `insert into plugin_metrics_current(plugin_id,github_stars,github_forks,github_open_issues,npm_downloads_day,npm_downloads_week,trend_score_7d,trend_score_30d,updated_at)
         select plugin_id,github_stars,github_forks,github_open_issues,npm_downloads_day,npm_downloads_week,trend_score_7d,trend_score_30d,unixepoch()*1000
         from plugin_metric_daily where plugin_id=? order by snapshot_date desc limit 1
         on conflict(plugin_id) do update set github_stars=excluded.github_stars,github_forks=excluded.github_forks,github_open_issues=excluded.github_open_issues,npm_downloads_day=excluded.npm_downloads_day,npm_downloads_week=excluded.npm_downloads_week,trend_score_7d=excluded.trend_score_7d,trend_score_30d=excluded.trend_score_30d,updated_at=excluded.updated_at`,
      )
      .bind(entry.pluginId),
  ]);
  await binding.batch(statements);
  return { stored: computed.length, snapshots: computed };
}

export type MaintenanceIssue = {
  code: string;
  severity: "critical" | "warning";
  count: number;
  sampleIds: string[];
};

async function issue(
  db: Database,
  code: string,
  severity: MaintenanceIssue["severity"],
  query: ReturnType<typeof sql>,
): Promise<MaintenanceIssue | null> {
  const rows = await db.all<{ id: string }>(query);
  return rows.length
    ? { code, severity, count: rows.length, sampleIds: rows.slice(0, 20).map((row) => row.id) }
    : null;
}

export async function auditMaintenance(
  db: Database,
  bucket: R2Bucket | undefined,
  scope: "daily" | "full",
) {
  const checks = await Promise.all([
    issue(
      db,
      "sync.open_over_24h",
      "critical",
      sql`select id from catalog_sync_runs where status='open' and started_at < (unixepoch()-86400)*1000`,
    ),
    issue(
      db,
      "localization.not_ready",
      "critical",
      sql`select p.id from plugins p cross join (select 'en' locale union all select 'zh') wanted
          left join plugin_localizations l on l.plugin_id=p.id and l.locale=wanted.locale
          where p.status='published' and p.lifecycle_status in ('active','unmaintained')
            and (l.plugin_id is null or l.translation_status!='ready')`,
    ),
    issue(
      db,
      "localization.source_hash_stale",
      "critical",
      sql`select l.plugin_id||':'||l.locale id from plugin_localizations l
          join plugins p on p.id=l.plugin_id
          join catalog_sync_items i on i.run_id=p.active_sync_run_id
            and json_extract(i.payload_json,'$.plugin.id')=p.id
          where p.status='published' and p.lifecycle_status in ('active','unmaintained')
            and l.translation_status='ready' and l.source_content_hash<>i.content_hash`,
    ),
    issue(
      db,
      "install_target.missing_primary",
      "critical",
      sql`select p.id from plugins p left join plugin_install_targets t on t.plugin_id=p.id and t.is_primary=1 and t.status='active'
          where p.status='published' and p.lifecycle_status in ('active','unmaintained') and t.id is null`,
    ),
    issue(
      db,
      "release.missing",
      "critical",
      sql`select p.id from plugins p left join plugin_releases r on r.plugin_id=p.id
          where p.status='published' and p.lifecycle_status in ('active','unmaintained') group by p.id having count(r.id)=0`,
    ),
    issue(
      db,
      "search.missing_locale",
      "warning",
      sql`select l.plugin_id||':'||l.locale id from plugin_localizations l left join plugin_search s on s.plugin_id=l.plugin_id and s.locale=l.locale
          join plugins p on p.id=l.plugin_id where p.status='published' and l.translation_status='ready' and s.plugin_id is null`,
    ),
    issue(
      db,
      "media.missing_alt",
      "warning",
      sql`select m.id from plugin_media m cross join (select 'en' locale union all select 'zh') wanted
          left join plugin_media_localizations l on l.media_id=m.id and l.locale=wanted.locale
          where m.status='active' and (l.media_id is null or trim(l.alt_text)='')`,
    ),
    issue(
      db,
      "metrics.stale_over_48h",
      "warning",
      sql`select p.id from plugins p left join plugin_metrics_current m on m.plugin_id=p.id
          where p.status='published' and p.lifecycle_status in ('active','unmaintained')
            and (m.plugin_id is null or m.updated_at < (unixepoch()-172800)*1000)`,
    ),
    issue(
      db,
      "alias.orphaned",
      "warning",
      sql`select a.id from plugin_aliases a left join plugins p on p.id=a.plugin_id where p.id is null`,
    ),
  ]);

  const media = await db.all<{ id: string; r2_key: string }>(sql`
    select id,r2_key from plugin_media where status='active'
    order by created_at desc limit ${scope === "daily" ? 50 : 10000}
  `);
  const missingR2: string[] = [];
  if (!bucket && media.length) missingR2.push(...media.map((entry) => entry.id));
  if (bucket) {
    for (const entry of media) {
      if (!(await bucket.head(entry.r2_key))) missingR2.push(entry.id);
    }
  }
  if (missingR2.length)
    checks.push({
      code: "media.r2_missing",
      severity: "critical",
      count: missingR2.length,
      sampleIds: missingR2.slice(0, 20),
    });

  const reports = await db.get<{ count: number }>(
    sql`select count(*) count from content_reports where status='open'`,
  );
  const active = await db.get<{ count: number }>(sql`
    select count(*) count from plugins where status='published' and lifecycle_status in ('active','unmaintained')
  `);
  const issues = checks.filter((entry): entry is MaintenanceIssue => entry !== null);
  return {
    scope,
    checkedAt: new Date().toISOString(),
    critical: issues.filter((entry) => entry.severity === "critical"),
    warnings: issues.filter((entry) => entry.severity === "warning"),
    stats: {
      publishedPlugins: active?.count ?? 0,
      openReports: reports?.count ?? 0,
      checkedMedia: media.length,
    },
  };
}
