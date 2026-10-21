import { listCatalogCardsBySlugs } from "@/lib/catalog/repository.server";
import type { CatalogCard } from "@/lib/catalog/types";
import type { Database } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";

// The CLI keeps run checkpoints locally, so the Hub only learns a runId when
// the report is published. Until writes carry an exact run tag, associate the
// plugins from the audit ledger by the report's actor and a server-clock
// window. The run lease is 60 minutes and publication follows the final write.
const REPORT_WINDOW_SLACK_MS = 5 * 60_000;
const REPORT_MAX_WINDOW_MS = 60 * 60_000;

type ReportDetailRow = {
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
  actions: string | null;
};

type NeighborRow = {
  run_id: string;
  completed_at: number;
};

export type OperationReportRelatedPlugin = {
  plugin: CatalogCard;
  actions: string[];
};

export type PublicOperationReportDetail = {
  runId: string;
  startedAt: string;
  completedAt: string;
  outcome: "completed" | "partial";
  body: string;
  related: OperationReportRelatedPlugin[];
  newer: { runId: string; completedAt: string } | null;
  older: { runId: string; completedAt: string } | null;
};

function neighbor(row: NeighborRow | undefined) {
  return row ? { runId: row.run_id, completedAt: new Date(row.completed_at).toISOString() } : null;
}

export async function getPublicOperationReportDetail(
  binding: Database,
  runId: string,
  locale: "en" | "zh",
): Promise<PublicOperationReportDetail | null> {
  const row = await binding.get<ReportDetailRow>(
    parameterizedSql(
      `select run_id,started_at,completed_at,outcome,body_en,body_zh,actor_token_id,created_at
       from hub_operation_reports where run_id=?`,
      [runId],
    ),
  );
  if (!row) return null;

  const duration = Math.min(Math.max(row.completed_at - row.started_at, 0), REPORT_MAX_WINDOW_MS);
  const windowStart = row.created_at - duration - REPORT_WINDOW_SLACK_MS;

  const [relatedRows, newerRow, olderRow] = await Promise.all([
    row.actor_token_id
      ? binding.all<RelatedPluginRow>(
          parameterizedSql(
            `select p.slug slug,group_concat(distinct a.action) actions
             from plugin_operation_audit a
             join plugins p on p.id=a.plugin_id
             where a.actor_token_id=?
               and a.plugin_id is not null
               and a.created_at between ? and ?
             group by p.slug
             order by min(a.created_at) asc`,
            [row.actor_token_id, windowStart, row.created_at],
          ),
        )
      : Promise.resolve([]),
    binding.get<NeighborRow>(
      parameterizedSql(
        `select run_id,completed_at from hub_operation_reports
         where completed_at>? or (completed_at=? and run_id>?)
         order by completed_at asc,run_id asc limit 1`,
        [row.completed_at, row.completed_at, row.run_id],
      ),
    ),
    binding.get<NeighborRow>(
      parameterizedSql(
        `select run_id,completed_at from hub_operation_reports
         where completed_at<? or (completed_at=? and run_id<?)
         order by completed_at desc,run_id desc limit 1`,
        [row.completed_at, row.completed_at, row.run_id],
      ),
    ),
  ]);

  const cards = await listCatalogCardsBySlugs(
    binding,
    relatedRows.map(({ slug }) => slug),
    locale,
  );
  const cardsBySlug = new Map(cards.map((card) => [card.slug, card]));
  return {
    runId: row.run_id,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: new Date(row.completed_at).toISOString(),
    outcome: row.outcome,
    body: locale === "zh" ? row.body_zh : row.body_en,
    related: relatedRows.flatMap(({ slug, actions }) => {
      const plugin = cardsBySlug.get(slug);
      if (!plugin) return [];
      return [
        {
          plugin,
          actions: [...new Set((actions ?? "").split(",").filter(Boolean))].sort(),
        },
      ];
    }),
    newer: neighbor(newerRow),
    older: neighbor(olderRow),
  };
}
