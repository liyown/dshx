import type { z } from "zod";

import type { targetVerificationPageSchema } from "./contracts";
import { sha256 } from "@/lib/auth/tokens.server";
import { HttpError, uuid } from "@/lib/http";

type VerificationPage = z.infer<typeof targetVerificationPageSchema>;

export async function commitTargetVerification(binding: D1Database, input: VerificationPage) {
  const payloadHash = await sha256(JSON.stringify(input));
  const existing = await binding
    .prepare("select id,status,payload_hash from catalog_sync_runs where idempotency_key=?")
    .bind(input.idempotencyKey)
    .first<{ id: string; status: string; payload_hash: string | null }>();
  if (existing) {
    if (existing.payload_hash !== payloadHash)
      throw new HttpError(
        409,
        "Idempotency key belongs to different target observations",
        "idempotency_conflict",
      );
    return { id: existing.id, status: existing.status, duplicate: true };
  }
  const ids = input.results.map((entry) => entry.repositoryPackageId);
  const placeholders = ids.map(() => "?").join(",");
  const found = await binding
    .prepare(
      `select rp.id,rp.package_name,rp.npm_package_name,rp.install_kind,rp.subdirectory,
        r.github_id from repository_packages rp join repositories r on r.id=rp.repository_id
       where rp.id in (${placeholders})`,
    )
    .bind(...ids)
    .all<{
      id: string;
      package_name: string;
      npm_package_name: string | null;
      install_kind: "npm" | "github";
      subdirectory: string;
      github_id: string;
    }>();
  if ((found.results ?? []).length !== new Set(ids).size)
    throw new HttpError(404, "One or more installation targets do not exist", "target_not_found");
  const packages = new Map((found.results ?? []).map((entry) => [entry.id, entry]));
  for (const result of input.results) {
    const target = packages.get(result.repositoryPackageId)!;
    if (!result.verification) continue;
    const identityKey =
      target.install_kind === "npm"
        ? `npm:${target.npm_package_name ?? target.package_name}`
        : `github:${target.github_id}:${target.subdirectory}`;
    if (
      result.verification.identityKey !== identityKey ||
      result.verification.packageName !== target.package_name
    )
      throw new HttpError(
        422,
        "Target attestation does not match its Hub installation identity",
        "target_identity_mismatch",
        { repositoryPackageId: result.repositoryPackageId, identityKey },
      );
  }

  const runId = uuid();
  const now = Date.parse(input.checkedAt);
  const statements: D1PreparedStatement[] = [
    binding
      .prepare(
        `insert into catalog_sync_runs(
          id,source,mode,status,schema_version,idempotency_key,payload_hash,expected_items,received_items,
          accepted_items,rejected_items,started_at,committed_at,finished_at
        ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        runId,
        "target-verification",
        "full",
        "committed",
        2,
        input.idempotencyKey,
        payloadHash,
        input.results.length,
        input.results.length,
        input.results.length,
        0,
        now,
        now,
        now,
      ),
  ];
  for (const result of input.results) {
    const summary = JSON.stringify({
      checkedAt: input.checkedAt,
      checks: result.checks,
      sources: result.sources,
      verification: result.verification,
    });
    if (result.status === "pass") {
      statements.push(
        binding
          .prepare(
            "update repository_packages set qualification_status='verified',consecutive_failures=0,validation_summary_json=?,verified_at=?,updated_at=? where id=?",
          )
          .bind(summary, now, now, result.repositoryPackageId),
        binding
          .prepare(
            "update plugin_install_targets set status='active',verified_at=?,updated_at=? where repository_package_id=?",
          )
          .bind(now, now, result.repositoryPackageId),
        binding
          .prepare(
            `update plugins set lifecycle_status='active',verification_status='verified',unavailable_at=null,updated_at=?
             where primary_repository_package_id=? and lifecycle_status='unavailable'`,
          )
          .bind(now, result.repositoryPackageId),
      );
    } else {
      statements.push(
        binding
          .prepare(
            `update repository_packages set consecutive_failures=consecutive_failures+1,
              qualification_status=case when consecutive_failures+1>=3 then 'unavailable' else qualification_status end,
              validation_summary_json=?,updated_at=? where id=?`,
          )
          .bind(summary, now, result.repositoryPackageId),
        binding
          .prepare(
            `update plugin_install_targets set status=case
               when (select consecutive_failures from repository_packages where id=?)>=3 then 'unavailable'
               else status end,updated_at=? where repository_package_id=?`,
          )
          .bind(result.repositoryPackageId, now, result.repositoryPackageId),
        binding
          .prepare(
            `update plugins set lifecycle_status=case
               when (select consecutive_failures from repository_packages where id=?)>=3 then 'unavailable'
               else lifecycle_status end,
              verification_status=case
               when (select consecutive_failures from repository_packages where id=?)>=3 then 'failed'
               else verification_status end,
              unavailable_at=case
               when (select consecutive_failures from repository_packages where id=?)>=3 then coalesce(unavailable_at,?)
               else unavailable_at end,updated_at=? where primary_repository_package_id=?`,
          )
          .bind(
            result.repositoryPackageId,
            result.repositoryPackageId,
            result.repositoryPackageId,
            now,
            now,
            result.repositoryPackageId,
          ),
      );
    }
  }
  await binding.batch(statements);
  return { id: runId, status: "committed", verified: input.results.length, duplicate: false };
}
