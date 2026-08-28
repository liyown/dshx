import type { OperationReportInput, PublicOperationReportQuery } from "./operations-v1.contracts";
import { OperationHttpError } from "./operations-v1.http";
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

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encodeCursor(completedAt: number, runId: string) {
  return btoa(JSON.stringify([completedAt, runId]))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeCursor(cursor?: string): [number, string] | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(atob(cursor.replaceAll("-", "+").replaceAll("_", "/"))) as unknown;
    if (
      Array.isArray(parsed) &&
      typeof parsed[0] === "number" &&
      Number.isFinite(parsed[0]) &&
      typeof parsed[1] === "string"
    )
      return [parsed[0], parsed[1]];
  } catch {
    // Normalized below.
  }
  throw new OperationHttpError(422, "invalid_cursor", "The pagination cursor is invalid", false, {
    repairHint: "Restart the report query without the cursor.",
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
  const payloadHash = await sha256(stablePayload(input));
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
  const cursor = decodeCursor(query.cursor);
  const result = await binding.all<ReportRow>(
    parameterizedSql(
      `select run_id,started_at,completed_at,outcome,body_en,body_zh,payload_hash,created_at
       from hub_operation_reports
       where (? is null or completed_at<? or (completed_at=? and run_id<?))
       order by completed_at desc,run_id desc limit ?`,
      [
        cursor?.[0] ?? null,
        cursor?.[0] ?? null,
        cursor?.[0] ?? null,
        cursor?.[1] ?? null,
        query.limit + 1,
      ],
    ),
  );
  const rows = result;
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      runId: row.run_id,
      startedAt: new Date(row.started_at).toISOString(),
      completedAt: new Date(row.completed_at).toISOString(),
      outcome: row.outcome,
      body: query.locale === "zh" ? row.body_zh : row.body_en,
    })),
    nextCursor:
      rows.length > query.limit && last ? encodeCursor(last.completed_at, last.run_id) : null,
  };
}
