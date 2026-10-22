/**
 * Community submissions, from queue to resolution.
 *
 * A resolution is final: the first one to land wins, and a second, different
 * one is a conflict rather than an overwrite. Accepting a submission also checks
 * the plugin is actually publishable, so "accepted" never points at a catalog
 * entry the ops API would still list as incomplete.
 */

import type { Database } from "@/lib/db/client";
import { runDrizzleBatch } from "@/lib/db/batch";
import { parameterizedSql } from "@/lib/db/parameterized-sql";

import { decodeCursor, encodeCursor } from "../cursor";
import type { SubmissionListQuery, SubmissionResolution } from "@becomeopc/dshx-hub-contracts";
import { canonicalJson } from "@becomeopc/dshx-hub-contracts";
import { OperationHttpError, requireCursor } from "../operations-v1.http";
import { getOpsPlugin } from "./plugins/reads.server";
import { findPlugin, parseJson } from "./store";

export async function listOpsSubmissions(binding: Database, query: SubmissionListQuery) {
  const cursor = requireCursor(decodeCursor(query.cursor, ["timestamp", "text"]));
  const statuses = query.status ?? [];
  const statusClause = statuses.length ? `status in (${statuses.map(() => "?").join(",")})` : "1=1";
  const result = await binding.all<Record<string, unknown>>(
    parameterizedSql(
      `select id,user_id userId,repository_url repositoryUrl,
        repository_full_name repositoryFullName,status,source_hash sourceHash,
        resolution_json resolution,created_at createdAt,updated_at updatedAt
       from plugin_submissions
       where ${statusClause}
         and (? is null or created_at<? or (created_at=? and id<?))
       order by created_at desc,id desc limit ?`,
      [
        ...statuses,
        cursor?.[0] ?? null,
        cursor?.[0] ?? null,
        cursor?.[0] ?? null,
        cursor?.[1] ?? null,
        query.limit + 1,
      ],
    ),
  );
  const rows = result;
  const page: Array<Record<string, unknown> & { id: string; createdAt: string }> = rows
    .slice(0, query.limit)
    .map((row) => ({
      ...row,
      id: String(row["id"]),
      resolution: parseJson(row["resolution"], null),
      createdAt: new Date(Number(row["createdAt"])).toISOString(),
      updatedAt: new Date(Number(row["updatedAt"])).toISOString(),
    }));
  const last = page.at(-1);
  return {
    items: page,
    nextCursor:
      rows.length > query.limit && last
        ? encodeCursor([Date.parse(last.createdAt), last.id])
        : null,
  };
}

export async function getOpsSubmission(binding: Database, id: string) {
  const row = await binding.get<Record<string, unknown>>(
    parameterizedSql(
      `select id,user_id userId,repository_url repositoryUrl,
        repository_full_name repositoryFullName,status,source_hash sourceHash,
        resolution_json resolution,
        created_at createdAt,updated_at updatedAt
       from plugin_submissions where id=?`,
      [id],
    ),
  );
  if (!row)
    throw new OperationHttpError(404, "submission_not_found", "Submission not found", false);
  return {
    ...row,
    resolution: parseJson(row["resolution"], null),
    createdAt: new Date(Number(row["createdAt"])).toISOString(),
    updatedAt: new Date(Number(row["updatedAt"])).toISOString(),
  };
}

export async function resolveOpsSubmission(
  binding: Database,
  actorTokenId: string,
  requestId: string,
  id: string,
  resolution: SubmissionResolution,
) {
  const current = await getOpsSubmission(binding, id);
  const existingResolution = current["resolution"];
  if (existingResolution) {
    if (canonicalJson(existingResolution) === canonicalJson(resolution))
      return { status: "unchanged", id, resolution: existingResolution };
    throw new OperationHttpError(
      409,
      "submission_resolved",
      "Submission is already resolved",
      false,
      {
        repairHint: "Run submission get and use its existing resolution.",
        details: { resolution: existingResolution },
      },
    );
  }
  if (resolution.pluginId) {
    const plugin = await findPlugin(binding, resolution.pluginId);
    if (!plugin)
      throw new OperationHttpError(404, "plugin_not_found", "Resolution plugin not found", false, {
        path: "pluginId",
      });
    if (resolution.result === "accepted") {
      const operational = await getOpsPlugin(binding, plugin.id);
      const incompleteNeeds = operational.needs.filter((need: string) =>
        ["readme", "publisher", "content", "metadata", "source", "target"].includes(need),
      );
      if (incompleteNeeds.length)
        throw new OperationHttpError(
          409,
          "submission_plugin_incomplete",
          "A submission cannot be accepted before its public source profile and bilingual curation are complete",
          true,
          {
            repairHint:
              "Refresh the source, store README and publisher facts, complete curation, then retry the resolution.",
            path: "pluginId",
            details: { pluginId: plugin.id, needs: incompleteNeeds },
          },
        );
    }
  }
  const now = Date.now();
  const result = await runDrizzleBatch(binding, [
    binding.run(
      parameterizedSql(
        "update plugin_submissions set status='resolved',resolution_json=?,updated_at=? where id=? and resolution_json is null",
        [canonicalJson(resolution), now, id],
      ),
    ),
    binding.run(
      parameterizedSql(
        `insert into plugin_operation_audit(
          id,request_id,actor_token_id,action,resource_type,resource_id,plugin_id,
          details_json,created_at
        ) select ?,?,?,?,?,?,?,?,? where changes()=1`,
        [
          crypto.randomUUID(),
          requestId,
          actorTokenId,
          `submission.${resolution.result}`,
          "submission",
          id,
          resolution.pluginId ?? null,
          canonicalJson({ resolution }),
          now,
        ],
      ),
    ),
  ]);
  if (!result[0]?.meta.changes) {
    const winner = await getOpsSubmission(binding, id);
    if (canonicalJson(winner["resolution"]) === canonicalJson(resolution))
      return { status: "unchanged", id, resolution: winner["resolution"] };
    throw new OperationHttpError(
      409,
      "submission_resolved",
      "Submission changed while resolving",
      true,
    );
  }
  return { status: "updated", id, resolution, resolvedAt: new Date(now).toISOString() };
}
