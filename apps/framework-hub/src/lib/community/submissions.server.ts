import type { Database } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";
import { HttpError, uuid } from "@/lib/http";
import type { SubmissionRow } from "./contracts";

/**
 * Plugin submissions.
 *
 * A submission is a GitHub repository a member — or an anonymous visitor with a
 * verified challenge — asks the catalog to consider. This module owns the
 * repository check, the idempotent create, and the anonymous rate-limiting key.
 */

function normalizeRepositoryUrl(raw: string) {
  const url = new URL(raw);
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname.toLowerCase() !== "github.com" || parts.length !== 2)
    throw new HttpError(422, "Use a GitHub repository root URL", "invalid_repository_url");
  const owner = parts[0]!;
  const repository = parts[1]!.replace(/\.git$/, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repository))
    throw new HttpError(422, "Invalid GitHub repository name", "invalid_repository_url");
  return { url: `https://github.com/${owner}/${repository}`, fullName: `${owner}/${repository}` };
}

export async function listSubmissions(binding: Database, userId: string) {
  const result = await binding.all<SubmissionRow>(
    parameterizedSql(
      `select id,user_id,repository_url,repository_full_name,status,source_hash,
        resolution_json,created_at,updated_at
       from plugin_submissions where user_id=? order by created_at desc`,
      [userId],
    ),
  );
  return { items: result };
}

export async function createSubmission(
  binding: Database,
  input: {
    userId: string | null;
    submitterKey: string;
    repositoryUrl: string;
    idempotencyKey: string;
  },
) {
  const existing = await binding.get<SubmissionRow>(
    parameterizedSql(
      `select id,user_id,repository_url,repository_full_name,status,source_hash,
        resolution_json,created_at,updated_at
       from plugin_submissions where submitter_key=? and idempotency_key=?`,
      [input.submitterKey, input.idempotencyKey],
    ),
  );
  if (existing) return existing;
  const repository = normalizeRepositoryUrl(input.repositoryUrl);
  const recent = await binding.get<{ count: number }>(
    parameterizedSql(
      "select count(*) count from plugin_submissions where submitter_key=? and created_at>=?",
      [input.submitterKey, Date.now() - 60_000],
    ),
  );
  if ((recent?.count ?? 0) >= 10)
    throw new HttpError(429, "Too many plugin submissions", "rate_limited");
  const id = uuid();
  await binding.run(
    parameterizedSql(
      "insert or ignore into plugin_submissions(id,user_id,submitter_key,repository_url,repository_full_name,status,idempotency_key,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)",
      [
        id,
        input.userId,
        input.submitterKey,
        repository.url,
        repository.fullName,
        "queued",
        input.idempotencyKey,
        Date.now(),
        Date.now(),
      ],
    ),
  );
  return binding.get<SubmissionRow>(
    parameterizedSql(
      `select id,user_id,repository_url,repository_full_name,status,source_hash,
        resolution_json,created_at,updated_at
       from plugin_submissions where submitter_key=? and idempotency_key=?`,
      [input.submitterKey, input.idempotencyKey],
    ),
  );
}

export async function anonymousSubmissionKey(request: Request, secret: string) {
  const forwarded =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(forwarded));
  return `anonymous:${Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** An appeal always carries the status of the approval its decision waits on. */
