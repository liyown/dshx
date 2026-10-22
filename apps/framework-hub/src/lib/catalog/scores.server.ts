import { waitUntil } from "cloudflare:workers";
import { sql, type SQL } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { describeError } from "@/lib/error-logging";

import { installReadySql } from "./install-readiness";

/**
 * Catalog ranking is split into two halves:
 *
 * - Facts that only change when a plugin is ingested or a visitor acts on it
 *   are stored in `plugin_scores` by `refreshPluginScores`. Rewriting them
 *   costs one pass over the catalog, so the code that changes a plugin calls
 *   the refresh with that plugin id.
 * - Facts that depend on the moment of reading (the recency buckets) or on
 *   the requested locale (the translation bonus) are applied by the catalog
 *   query. Recency therefore rolls over without a scheduled job.
 *
 * `catalogQualityBase` / `catalogPopularityBase` are the only definitions of
 * the aggregate formulas; the catalog query falls back to them for a plugin
 * that has not been scored yet, so a missing row degrades to the previous
 * behavior instead of dropping the plugin from the catalog.
 */

const dayMs = 86_400_000;

/**
 * D1 caps bound parameters per statement, so explicit id lists are scored in
 * chunks.
 */
const SCORE_ID_CHUNK_SIZE = 50;

/** How long an isolate trusts its last missing-score check. */
const SCORE_SELF_HEAL_INTERVAL_MS = 5 * 60_000;

let lastScoreCheckAt = 0;

export const latestPublishedAt = sql`coalesce(
  (select release.published_at from plugin_releases release
   where release.plugin_id = p.id and release.version = p.latest_version
   order by release.published_at desc limit 1),
  p.published_at
)`;

/**
 * Quality score without the parts that depend on when or in which language
 * the catalog is read: the last-synced / last-published recency buckets and
 * the locale translation bonus.
 */
export function catalogQualityBase(): SQL {
  return sql`(
    case when ${installReadySql} then 15 else 0 end
    + case when p.verification_status = 'verified' then 5 else 0 end
    + case when p.repository_url is not null and trim(p.repository_url) != '' then 4 else 0 end
    + case when p.dshx_detected = 1 then 3 else 0 end
    + case when exists(
        select 1 from plugin_source_documents source_document
        where source_document.plugin_id = p.id
          and source_document.kind = 'readme'
          and source_document.availability = 'available'
          and source_document.source_url != ''
      ) then 3 else 0 end
    + case
        when exists(
          select 1 from plugin_source_documents source_document
          where source_document.plugin_id = p.id
            and source_document.kind = 'readme'
            and source_document.availability = 'available'
            and length(coalesce(source_document.content, '')) >= 800
        ) then 6
        when exists(
          select 1 from plugin_source_documents source_document
          where source_document.plugin_id = p.id
            and source_document.kind = 'readme'
            and source_document.availability = 'available'
            and length(coalesce(source_document.content, '')) >= 200
        ) then 3
        else 0
      end
    + case when p.license_spdx is not null and trim(p.license_spdx) != '' then 2 else 0 end
    + case when exists(
        select 1 from plugin_media media
        where media.plugin_id = p.id and media.kind = 'screenshot' and media.status = 'active'
      ) then 2 else 0 end
    + case
        when trim(p.compatibility_range) != '' and trim(p.compatibility_range) != '*' then 7
        else 0
      end
    + case when exists(
        select 1 from plugin_releases release
        where release.plugin_id = p.id
          and release.version = p.latest_version
          and release.channel = 'stable'
          and release.deprecated = 0
      ) then 8 else 0 end
    + case when exists(
        select 1 from plugin_releases release
        where release.plugin_id = p.id
          and release.version = p.latest_version
          and release.compatibility_source in ('manifest', 'peer-dependency')
      ) then 5 else 0 end
    + case when exists(
        select 1 from plugin_install_targets install_target
        where install_target.plugin_id = p.id
          and install_target.is_primary = 1
          and install_target.status = 'active'
          and (
            (install_target.kind = 'npm' and install_target.integrity is not null)
            or
            (install_target.kind = 'github' and exists(
              select 1 from plugin_releases release
              where release.plugin_id = p.id
                and release.version = p.latest_version
                and release.git_tag is not null
                and trim(release.git_tag) != ''
            ))
          )
      ) then 5 else 0 end
    + case when p.lifecycle_status = 'active' then 6 else 0 end
    + case when (
        select count(*) from plugin_releases release where release.plugin_id = p.id
      ) >= 2 then 3 else 0 end
  )`;
}

/**
 * Popularity score without the recency bucket and the quality band; both are
 * applied when the catalog is read. Expects `p` to be joined to
 * `plugin_metrics_current m`.
 */
export function catalogPopularityBase(): SQL {
  return sql`(
    case
      when coalesce(m.github_stars, 0) >= 1000 then 30
      when coalesce(m.github_stars, 0) >= 300 then 26
      when coalesce(m.github_stars, 0) >= 100 then 22
      when coalesce(m.github_stars, 0) >= 50 then 18
      when coalesce(m.github_stars, 0) >= 20 then 14
      when coalesce(m.github_stars, 0) >= 10 then 10
      when coalesce(m.github_stars, 0) >= 5 then 6
      when coalesce(m.github_stars, 0) >= 1 then 2
      else 0
    end
    + case
      when coalesce(m.npm_downloads_week, 0) >= 10000 then 30
      when coalesce(m.npm_downloads_week, 0) >= 3000 then 26
      when coalesce(m.npm_downloads_week, 0) >= 1000 then 22
      when coalesce(m.npm_downloads_week, 0) >= 300 then 18
      when coalesce(m.npm_downloads_week, 0) >= 100 then 14
      when coalesce(m.npm_downloads_week, 0) >= 30 then 10
      when coalesce(m.npm_downloads_week, 0) >= 10 then 6
      when coalesce(m.npm_downloads_week, 0) >= 1 then 2
      else 0
    end
    + case
      when (select count(*) from plugin_bookmarks bookmark where bookmark.plugin_id = p.id) >= 50 then 10
      when (select count(*) from plugin_bookmarks bookmark where bookmark.plugin_id = p.id) >= 20 then 8
      when (select count(*) from plugin_bookmarks bookmark where bookmark.plugin_id = p.id) >= 10 then 6
      when (select count(*) from plugin_bookmarks bookmark where bookmark.plugin_id = p.id) >= 5 then 4
      when (select count(*) from plugin_bookmarks bookmark where bookmark.plugin_id = p.id) >= 1 then 2
      else 0
    end
    + case
      when (select count(*) from plugin_follows follow where follow.plugin_id = p.id) >= 50 then 10
      when (select count(*) from plugin_follows follow where follow.plugin_id = p.id) >= 20 then 8
      when (select count(*) from plugin_follows follow where follow.plugin_id = p.id) >= 10 then 6
      when (select count(*) from plugin_follows follow where follow.plugin_id = p.id) >= 5 then 4
      when (select count(*) from plugin_follows follow where follow.plugin_id = p.id) >= 1 then 2
      else 0
    end
    + case
      when coalesce(m.review_count, 0) >= 20
        and coalesce(m.rating_sum, 0) * 1.0 / m.review_count >= 4.5 then 10
      when coalesce(m.review_count, 0) >= 10
        and coalesce(m.rating_sum, 0) * 1.0 / m.review_count >= 4 then 8
      when coalesce(m.review_count, 0) >= 5
        and coalesce(m.rating_sum, 0) * 1.0 / m.review_count >= 4 then 6
      when coalesce(m.review_count, 0) >= 1 then 2
      else 0
    end
  )`;
}

/**
 * Stored aggregate score, or the live formula for a plugin that has not been
 * scored yet. Expects `p` and `s` (left-joined `plugin_scores`) in scope.
 */
export function storedOrLiveQuality(): SQL {
  return sql`case when s.quality_base is null then ${catalogQualityBase()} else s.quality_base end`;
}

/** Expects `p`, `m`, and `s` in scope. */
export function storedOrLivePopularity(): SQL {
  return sql`case when s.popularity_base is null then ${catalogPopularityBase()} else s.popularity_base end`;
}

/** Translation readiness and overview depth for the requested locale. */
export function localeQualityBonus(): SQL {
  return sql`(
    case when requested.translation_status = 'ready' then 8 else 0 end
    + case
        when length(trim(coalesce(requested.overview_markdown, ''))) >= 240 then 7
        when length(trim(coalesce(requested.overview_markdown, ''))) >= 80 then 3
        else 0
      end
  )`;
}

export function qualityRecencyScore(lastSyncedAt: SQL, latestPublished: SQL, now: number): SQL {
  return sql`(
    case
      when ${lastSyncedAt} >= ${now - 30 * dayMs} then 5
      when ${lastSyncedAt} >= ${now - 90 * dayMs} then 2
      else 0
    end
    + case
      when ${latestPublished} >= ${now - 180 * dayMs} then 6
      when ${latestPublished} >= ${now - 365 * dayMs} then 3
      else 0
    end
  )`;
}

export function popularityRecencyScore(latestPublished: SQL, qualityScore: SQL, now: number): SQL {
  return sql`(
    case
      when ${latestPublished} >= ${now - 30 * dayMs} then 5
      when ${latestPublished} >= ${now - 90 * dayMs} then 3
      when ${latestPublished} >= ${now - 180 * dayMs} then 1
      else 0
    end
    + case
      when ${qualityScore} >= 80 then 5
      when ${qualityScore} >= 60 then 3
      when ${qualityScore} >= 40 then 1
      else 0
    end
  )`;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function idFilter(ids: readonly string[]): SQL {
  return sql` and p.id in (${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`;
}

/**
 * Recomputes `plugin_scores` for the published catalog, or for the given
 * plugins. The stored columns are locale-independent; only the recency
 * buckets and translation bonus are applied at read time.
 */
export async function refreshPluginScores(
  db: Database,
  options: { pluginIds?: readonly string[] } = {},
): Promise<void> {
  const now = Date.now();
  const ids = options.pluginIds ? [...new Set(options.pluginIds)] : null;
  if (ids && ids.length === 0) return;
  const groups = ids ? chunks(ids, SCORE_ID_CHUNK_SIZE) : [null];
  await Promise.all(
    groups.map((group) =>
      db.run(sql`
      insert into plugin_scores(
        plugin_id, quality_base, popularity_base, latest_published_at, last_synced_at, scored_at
      )
      select p.id, ${catalogQualityBase()}, ${catalogPopularityBase()}, ${latestPublishedAt},
        p.last_synced_at, ${now}
      from plugins p
      left join plugin_metrics_current m on m.plugin_id = p.id
      where p.status = 'published'${group ? idFilter(group) : sql``}
      on conflict(plugin_id) do update set
        quality_base = excluded.quality_base,
        popularity_base = excluded.popularity_base,
        latest_published_at = excluded.latest_published_at,
        last_synced_at = excluded.last_synced_at,
        scored_at = excluded.scored_at
    `),
    ),
  );
}

/**
 * Scores a published plugin right after its facts changed. Failures are
 * logged rather than thrown: the catalog falls back to the live formula, and
 * the write that triggered the refresh has already been committed.
 */
export async function refreshPluginScore(db: Database, pluginId: string): Promise<void> {
  try {
    await refreshPluginScores(db, { pluginIds: [pluginId] });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Catalog score refresh failed",
        pluginId,
        error: describeError(error),
      }),
    );
  }
}

async function scoreIfMissing(db: Database): Promise<void> {
  const missing = await db.get(sql`
    select 1 as missing
    from plugins p
    left join plugin_scores s on s.plugin_id = p.id
    where p.status = 'published' and s.plugin_id is null
    limit 1
  `);
  if (missing) await refreshPluginScores(db);
}

/**
 * Repairs scores that were never written (first deploy after the table
 * existed, a restored database, a refresh that failed). Runs in the
 * background and at most once per interval per isolate; the request that
 * notices the gap still renders from the live formula.
 */
export function ensurePluginScores(db: Database): void {
  const now = Date.now();
  if (now - lastScoreCheckAt < SCORE_SELF_HEAL_INTERVAL_MS) return;
  lastScoreCheckAt = now;
  waitUntil(
    scoreIfMissing(db).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Catalog score backfill failed",
          error: describeError(error),
        }),
      );
    }),
  );
}
