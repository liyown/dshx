import { listCatalogCardsBySlugs } from "@/lib/catalog/repository.server";
import type { CatalogCard } from "@/lib/catalog/types";
import type { Database } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";

import { OPERATION_REPORT_DAY_SQL } from "./operation-report-day";
import { OPERATION_REPORT_EARLIER_LIMIT, isOperationReportMerged } from "./operation-report-view";

// The CLI keeps run checkpoints locally, so the Hub only learns a runId when
// the report is published. Until writes carry an exact run tag, associate the
// plugins from the audit ledger by the report's actor and a server-clock
// window. The run lease is 60 minutes and publication follows the final write.
const REPORT_WINDOW_SLACK_MS = 5 * 60_000;
const REPORT_MAX_WINDOW_MS = 60 * 60_000;

type ReportDayRow = {
  run_id: string;
  started_at: number;
  completed_at: number;
  outcome: "completed" | "partial";
  body_en: string;
  body_zh: string;
  actor_token_id: string | null;
  created_at: number;
};

type RelatedPluginRow = {
  slug: string;
  action: string;
};

export type OperationReportDayRun = {
  runId: string;
  startedAt: string;
  completedAt: string;
  outcome: "completed" | "partial";
  body: string;
};

export type OperationReportRelatedPlugin = {
  plugin: CatalogCard;
  actions: string[];
};

export type PublicOperationReportDay = {
  day: string;
  startedAt: string;
  completedAt: string;
  outcome: "completed" | "partial";
  runCount: number;
  body: string;
  earlier: OperationReportDayRun[];
  earlierTotal: number;
  related: OperationReportRelatedPlugin[];
  newerDay: string | null;
  olderDay: string | null;
};

function reportBody(row: ReportDayRow, locale: "en" | "zh") {
  return locale === "zh" ? row.body_zh : row.body_en;
}

function runFromRow(row: ReportDayRow, locale: "en" | "zh"): OperationReportDayRun {
  return {
    runId: row.run_id,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: new Date(row.completed_at).toISOString(),
    outcome: row.outcome,
    body: reportBody(row, locale),
  };
}

async function relatedRowsForRun(binding: Database, row: ReportDayRow) {
  if (!row.actor_token_id) return [];
  const duration = Math.min(Math.max(row.completed_at - row.started_at, 0), REPORT_MAX_WINDOW_MS);
  const windowStart = row.created_at - duration - REPORT_WINDOW_SLACK_MS;
  return binding.all<RelatedPluginRow>(
    parameterizedSql(
      `select p.slug slug,a.action action
       from plugin_operation_audit a
       join plugins p on p.id=a.plugin_id
       where a.actor_token_id=?
         and a.plugin_id is not null
         and a.created_at between ? and ?
       order by a.created_at asc`,
      [row.actor_token_id, windowStart, row.created_at],
    ),
  );
}

async function relatedPlugins(
  binding: Database,
  rows: readonly ReportDayRow[],
  locale: "en" | "zh",
) {
  const actionRows = await Promise.all(rows.map((row) => relatedRowsForRun(binding, row)));
  const actionsBySlug = new Map<string, Set<string>>();
  for (const related of actionRows) {
    for (const { slug, action } of related) {
      const actions = actionsBySlug.get(slug) ?? new Set<string>();
      actions.add(action);
      actionsBySlug.set(slug, actions);
    }
  }
  const cards = await listCatalogCardsBySlugs(binding, [...actionsBySlug.keys()], locale);
  const cardsBySlug = new Map(cards.map((card) => [card.slug, card]));
  return [...actionsBySlug.entries()].flatMap(([slug, actions]) => {
    const plugin = cardsBySlug.get(slug);
    if (!plugin) return [];
    return [{ plugin, actions: [...actions].sort() }];
  });
}

async function neighborDay(binding: Database, day: string, direction: "newer" | "older") {
  const comparison = direction === "newer" ? ">" : "<";
  const ordering = direction === "newer" ? "asc" : "desc";
  const row = await binding.get<{ day: string }>(
    parameterizedSql(
      `select distinct ${OPERATION_REPORT_DAY_SQL} day
       from hub_operation_reports
       where ${OPERATION_REPORT_DAY_SQL} ${comparison} ?
       order by day ${ordering} limit 1`,
      [day],
    ),
  );
  return row?.day ?? null;
}

export async function getOperationReportDayForRun(binding: Database, runId: string) {
  const row = await binding.get<{ day: string }>(
    parameterizedSql(
      `select ${OPERATION_REPORT_DAY_SQL} day
       from hub_operation_reports where run_id=?`,
      [runId],
    ),
  );
  return row?.day ?? null;
}

export async function getPublicOperationReportDay(
  binding: Database,
  day: string,
  locale: "en" | "zh",
): Promise<PublicOperationReportDay | null> {
  const rows = await binding.all<ReportDayRow>(
    parameterizedSql(
      `select run_id,started_at,completed_at,outcome,body_en,body_zh,actor_token_id,created_at
       from hub_operation_reports
       where ${OPERATION_REPORT_DAY_SQL}=?
       order by completed_at asc,run_id asc`,
      [day],
    ),
  );
  const first = rows[0];
  if (!first) return null;

  const latest = rows.at(-1) as ReportDayRow;
  const body = reportBody(latest, locale);
  // A cumulative report starts with the merge marker. Older reports without it
  // keep their earlier same-day bodies visible instead of silently dropping
  // work that predates the daily-merge prompt.
  const earlierRows = isOperationReportMerged(body) ? [] : rows.slice(0, -1).reverse();
  const earlier = earlierRows
    .slice(0, OPERATION_REPORT_EARLIER_LIMIT)
    .map((row) => runFromRow(row, locale));

  const [related, newerDay, olderDay] = await Promise.all([
    relatedPlugins(binding, rows, locale),
    neighborDay(binding, day, "newer"),
    neighborDay(binding, day, "older"),
  ]);

  return {
    day,
    startedAt: new Date(first.started_at).toISOString(),
    completedAt: new Date(latest.completed_at).toISOString(),
    outcome: rows.some((row) => row.outcome === "partial") ? "partial" : "completed",
    runCount: rows.length,
    body,
    earlier,
    earlierTotal: earlierRows.length,
    related,
    newerDay,
    olderDay,
  };
}
