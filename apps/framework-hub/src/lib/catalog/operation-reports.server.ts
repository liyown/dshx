import { decodeCursor, encodeCursor } from "./cursor";
import { digest } from "./digest";
import type { OperationReportInput, PublicOperationReportQuery } from "./operations-v1.contracts";
import { OperationHttpError, requireCursor } from "./operations-v1.http";
import type { Database } from "@/lib/db/client";
import { runDrizzleBatch } from "@/lib/db/batch";
import { parameterizedSql } from "@/lib/db/parameterized-sql";

type ReportRow = {
  run_id: string;
  started_at: number;
  completed_at: number;
  outcome: "completed" | "partial";
  body_en: string;
  body_zh: string;
  payload_hash: string;
  created_at: number;
};

function stablePayload(input: OperationReportInput) {
  return JSON.stringify({
    schemaVersion: input.schemaVersion,
    runId: input.runId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    outcome: input.outcome,
    body: { en: input.body.en, zh: input.body.zh },
  });
}

function privateReport(row: ReportRow) {
  return {
    schemaVersion: 1 as const,
    runId: row.run_id,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: new Date(row.completed_at).toISOString(),
    outcome: row.outcome,
    body: { en: row.body_en, zh: row.body_zh },
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function latestOperationReport(binding: Database) {
  const row = await binding.get<ReportRow>(
    parameterizedSql(
      `select run_id,started_at,completed_at,outcome,body_en,body_zh,payload_hash,created_at
       from hub_operation_reports order by completed_at desc,run_id desc limit 1`,
      [],
    ),
  );
  return row ? privateReport(row) : null;
}

export async function publishOperationReport(
  binding: Database,
  actorTokenId: string,
  input: OperationReportInput,
) {
  const payloadHash = await digest(stablePayload(input));
  const existing = await binding.get<{ payload_hash: string }>(
    parameterizedSql("select payload_hash from hub_operation_reports where run_id=?", [
      input.runId,
    ]),
  );
  if (existing) {
    if (existing.payload_hash === payloadHash)
      return { status: "unchanged" as const, report: await reportById(binding, input.runId) };
    throw new OperationHttpError(
      409,
      "idempotency_conflict",
      "runId already belongs to a different immutable report",
      false,
      { path: "runId", repairHint: "Generate a new runId for a distinct operations run." },
    );
  }
  try {
    await runDrizzleBatch(binding, [
      binding.run(
        parameterizedSql(
          `insert into hub_operation_reports(
            run_id,started_at,completed_at,outcome,body_en,body_zh,payload_hash,actor_token_id,created_at
          ) values(?,?,?,?,?,?,?,?,?)`,
          [
            input.runId,
            Date.parse(input.startedAt),
            Date.parse(input.completedAt),
            input.outcome,
            input.body.en,
            input.body.zh,
            payloadHash,
            actorTokenId,
            Date.now(),
          ],
        ),
      ),
      binding.run(
        parameterizedSql(
          `delete from hub_operation_reports where run_id in (
          select run_id from hub_operation_reports
          order by completed_at desc,run_id desc limit -1 offset 1000
        )`,
          [],
        ),
      ),
    ]);
  } catch (error) {
    if (!(error instanceof Error) || !/UNIQUE constraint failed/i.test(error.message)) throw error;
    const winner = await binding.get<{ payload_hash: string }>(
      parameterizedSql("select payload_hash from hub_operation_reports where run_id=?", [
        input.runId,
      ]),
    );
    if (winner?.payload_hash !== payloadHash)
      throw new OperationHttpError(
        409,
        "idempotency_conflict",
        "runId was published concurrently with different content",
        false,
      );
  }
  return { status: "created" as const, report: await reportById(binding, input.runId) };
}

async function reportById(binding: Database, runId: string) {
  const row = await binding.get<ReportRow>(
    parameterizedSql(
      `select run_id,started_at,completed_at,outcome,body_en,body_zh,payload_hash,created_at
       from hub_operation_reports where run_id=?`,
      [runId],
    ),
  );
  if (!row)
    throw new OperationHttpError(404, "report_not_found", "Operations report not found", false);
  return privateReport(row);
}

export async function listPublicOperationReports(
  binding: Database,
  query: PublicOperationReportQuery,
) {
  const cursor = requireCursor(decodeCursor(query.cursor, ["day"]));
  // Group by the Asia/Shanghai calendar day so the public log shows one entry
  // per day. Reports stay immutable per run; the newest report of the day is
  // the cumulative body when the operations prompt merged the day's work.
  const rows = await binding.all<{
    day: string;
    run_count: number;
    started_at: number;
    completed_at: number;
    partial: number;
    body_en: string;
    body_zh: string;
    run_id: string;
  }>(
    parameterizedSql(
      `with ranked as (
        select run_id,started_at,completed_at,outcome,body_en,body_zh,
          date(completed_at/1000,'unixepoch','+8 hours') day,
          row_number() over (
            partition by date(completed_at/1000,'unixepoch','+8 hours')
            order by completed_at desc,run_id desc
          ) rn
        from hub_operation_reports
      ),
      days as (
        select day,count(*) run_count,min(started_at) started_at,max(completed_at) completed_at,
          max(case when outcome='partial' then 1 else 0 end) partial
        from ranked group by day
      )
      select d.day,d.run_count,d.started_at,d.completed_at,d.partial,
        substr(r.body_en,1,2000) body_en,substr(r.body_zh,1,2000) body_zh,r.run_id
      from days d
      join ranked r on r.day=d.day and r.rn=1
      where (? is null or d.day<?)
      order by d.day desc limit ?`,
      [cursor, cursor, query.limit + 1],
    ),
  );
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      day: row.day,
      runCount: row.run_count,
      startedAt: new Date(row.started_at).toISOString(),
      completedAt: new Date(row.completed_at).toISOString(),
      outcome: row.partial === 1 ? ("partial" as const) : ("completed" as const),
      latestRunId: row.run_id,
      body: query.locale === "zh" ? row.body_zh : row.body_en,
    })),
    nextCursor: rows.length > query.limit && last ? encodeCursor([last.day]) : null,
  };
}
