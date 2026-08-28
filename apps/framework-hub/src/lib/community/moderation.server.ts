import type { z } from "zod";
import type { BatchItem } from "drizzle-orm/batch";

import type { moderationActionSchema } from "@/lib/catalog/contracts";
import type { Database } from "@/lib/db/client";
import { runDrizzleBatch } from "@/lib/db/batch";
import { parameterizedSql } from "@/lib/db/parameterized-sql";
import { HttpError, uuid } from "@/lib/http";

type ModerationInput = z.infer<typeof moderationActionSchema>;

type QueueRow = {
  target_type: "plugin" | "review" | "reply" | "profile" | "collection";
  target_id: string;
  report_ids: string;
  reports: string;
  report_count: number;
  oldest_reported_at: number;
  body: string | null;
  locale: string | null;
  content_status: string;
  author_user_id: string | null;
  author_github_login: string | null;
  author_status: string | null;
  plugin_id: string | null;
  plugin_slug: string | null;
  prior_restrictions_30d: number;
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function listModerationQueue(binding: Database) {
  const result = await binding.all<QueueRow>(
    parameterizedSql(
      `select cr.target_type,cr.target_id,
        json_group_array(cr.id) report_ids,
        json_group_array(json_object(
          'id',cr.id,'reason',cr.reason,'details',cr.details,
          'reporterUserId',cr.reporter_user_id,'createdAt',cr.created_at
        )) reports,
        count(*) report_count,min(cr.created_at) oldest_reported_at,
        case cr.target_type
          when 'review' then pr.body when 'reply' then rr.body
          when 'plugin' then target_plugin.description when 'profile' then target_profile.bio
          when 'collection' then target_collection.description end body,
        case cr.target_type when 'review' then pr.locale when 'reply' then rr.locale else null end locale,
        case cr.target_type
          when 'review' then pr.status when 'reply' then rr.status
          when 'plugin' then target_plugin.lifecycle_status when 'profile' then target_profile.status
          when 'collection' then target_collection.visibility end content_status,
        coalesce(pr.user_id,rr.user_id,target_profile.user_id,target_collection.user_id) author_user_id,
        up.github_login author_github_login,up.status author_status,
        coalesce(pr.plugin_id,parent_review.plugin_id,target_plugin.id) plugin_id,
        coalesce(review_plugin.slug,target_plugin.slug) plugin_slug,
        (select count(*) from moderation_actions ma
          where ma.target_type='user' and ma.target_id=coalesce(pr.user_id,rr.user_id,target_profile.user_id,target_collection.user_id)
            and ma.action in ('restrict','ban')
            and ma.created_at >= unixepoch('now','-30 day')*1000
        ) prior_restrictions_30d
      from content_reports cr
      left join plugin_reviews pr
        on cr.target_type='review' and pr.id=cr.target_id
      left join review_replies rr
        on cr.target_type='reply' and rr.id=cr.target_id
      left join plugin_reviews parent_review
        on cr.target_type='reply' and parent_review.id=rr.review_id
      left join plugins review_plugin on review_plugin.id=coalesce(pr.plugin_id,parent_review.plugin_id)
      left join plugins target_plugin on cr.target_type='plugin' and target_plugin.id=cr.target_id
      left join user_profiles target_profile on cr.target_type='profile' and target_profile.user_id=cr.target_id
      left join collections target_collection on cr.target_type='collection' and target_collection.id=cr.target_id
      left join user_profiles up on up.user_id=coalesce(pr.user_id,rr.user_id,target_profile.user_id,target_collection.user_id)
      where cr.status='open'
      group by cr.target_type,cr.target_id
      order by oldest_reported_at asc
      limit 100`,
      [],
    ),
  );

  return result.map((row) => ({
    targetType: row.target_type,
    targetId: row.target_id,
    reportIds: parseJson<string[]>(row.report_ids, []),
    reports: parseJson<
      Array<{
        id: string;
        reason: string;
        details: string | null;
        reporterUserId: string;
        createdAt: number;
      }>
    >(row.reports, []),
    reportCount: row.report_count,
    oldestReportedAt: new Date(row.oldest_reported_at).toISOString(),
    content: {
      body: row.body,
      locale: row.locale,
      status: row.content_status,
    },
    author: {
      userId: row.author_user_id,
      githubLogin: row.author_github_login,
      status: row.author_status,
      priorRestrictions30d: row.prior_restrictions_30d,
    },
    plugin: row.plugin_id ? { id: row.plugin_id, slug: row.plugin_slug } : null,
  }));
}

async function validateReports(binding: Database, input: ModerationInput) {
  if (input.reportIds.length === 0) return;
  const placeholders = input.reportIds.map(() => "?").join(",");
  const reports = await binding.all<{
    id: string;
    target_type: string;
    target_id: string;
    status: string;
    author_user_id: string;
  }>(
    parameterizedSql(
      `select cr.id,cr.target_type,cr.target_id,cr.status,
        coalesce(pr.user_id,rr.user_id) author_user_id
      from content_reports cr
      left join plugin_reviews pr on cr.target_type='review' and pr.id=cr.target_id
      left join review_replies rr on cr.target_type='reply' and rr.id=cr.target_id
      where cr.id in (${placeholders})`,
      [...input.reportIds],
    ),
  );
  const matching = reports.filter((report) => {
    if (input.targetType === "user") {
      return (
        ["open", "resolved"].includes(report.status) && report.author_user_id === input.targetId
      );
    }
    return (
      report.status === "open" &&
      report.target_type === input.targetType &&
      report.target_id === input.targetId
    );
  });
  if (matching.length !== input.reportIds.length) {
    throw new HttpError(
      409,
      "Every report must be open and match the moderation target",
      "report_conflict",
    );
  }
}

async function validateTarget(binding: Database, input: ModerationInput) {
  const table = {
    plugin: "plugins",
    review: "plugin_reviews",
    reply: "review_replies",
    profile: "user_profiles",
    collection: "collections",
    user: "user_profiles",
  }[input.targetType];
  const column = ["user", "profile"].includes(input.targetType) ? "user_id" : "id";
  const target = await binding.get<{ id: string }>(
    parameterizedSql(`select ${column} id from ${table} where ${column}=? limit 1`, [
      input.targetId,
    ]),
  );
  if (!target) throw new HttpError(404, "Moderation target not found", "target_not_found");
}

function validateAutomaticPolicy(input: ModerationInput, now: number) {
  if (["hide", "restrict"].includes(input.action)) {
    if (
      input.confidence == null ||
      input.confidence < 0.95 ||
      !input.decisionCode ||
      !input.policyVersion
    ) {
      throw new HttpError(
        422,
        "Automatic enforcement requires a decision code, policy version, and confidence of at least 0.95",
        "automatic_policy_threshold_not_met",
      );
    }
  }
  if (input.action !== "restrict") return;
  if (!input.expiresAt) {
    throw new HttpError(
      409,
      "Automatic write restrictions must expire after 24 hours or 7 days",
      "approval_required",
    );
  }
  const duration = Date.parse(input.expiresAt) - now;
  const tolerance = 5 * 60_000;
  const allowed = [24 * 60 * 60_000, 7 * 24 * 60 * 60_000];
  if (!allowed.some((value) => Math.abs(duration - value) <= tolerance)) {
    throw new HttpError(
      422,
      "Automatic write restrictions must expire after 24 hours or 7 days",
      "invalid_restriction_duration",
    );
  }
}

export async function applyModerationAction(
  binding: Database,
  actorId: string,
  input: ModerationInput,
) {
  if (["restore", "unrestrict", "ban", "unban"].includes(input.action)) {
    throw new HttpError(
      409,
      "This high-risk action requires an approved effect",
      "approval_required",
    );
  }
  await validateTarget(binding, input);
  await validateReports(binding, input);

  const now = Date.now();
  validateAutomaticPolicy(input, now);
  const actionId = uuid();
  const statements: BatchItem<"sqlite">[] = [];
  if (input.targetType === "review" && ["hide", "restore"].includes(input.action)) {
    statements.push(
      binding.run(
        parameterizedSql("update plugin_reviews set status=?,updated_at=? where id=?", [
          input.action === "hide" ? "hidden" : "published",
          now,
          input.targetId,
        ]),
      ),
    );
  }
  if (input.targetType === "reply" && ["hide", "restore"].includes(input.action)) {
    statements.push(
      binding.run(
        parameterizedSql("update review_replies set status=?,updated_at=? where id=?", [
          input.action === "hide" ? "hidden" : "published",
          now,
          input.targetId,
        ]),
      ),
    );
  }
  if (input.targetType === "user" && ["restrict", "ban"].includes(input.action)) {
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into user_restrictions(
            id,user_id,kind,reason,starts_at,expires_at,created_by_actor_type,created_by_actor_id
          ) values(?,?,?,?,?,?,?,?)`,
          [
            uuid(),
            input.targetId,
            input.action === "ban" ? "ban" : "write",
            input.reason,
            now,
            Date.parse(input.expiresAt!),
            "api_token",
            actorId,
          ],
        ),
      ),
      binding.run(
        parameterizedSql("update user_profiles set status=?,updated_at=? where user_id=?", [
          input.action === "ban" ? "banned" : "restricted",
          now,
          input.targetId,
        ]),
      ),
    );
  }
  if (input.targetType === "user" && ["unrestrict", "unban"].includes(input.action)) {
    statements.push(
      binding.run(
        parameterizedSql(
          "update user_restrictions set revoked_at=? where user_id=? and revoked_at is null",
          [now, input.targetId],
        ),
      ),
      binding.run(
        parameterizedSql("update user_profiles set status='active',updated_at=? where user_id=?", [
          now,
          input.targetId,
        ]),
      ),
    );
  }

  if (input.reportIds.length > 0) {
    const placeholders = input.reportIds.map(() => "?").join(",");
    statements.push(
      binding.run(
        parameterizedSql(
          `update content_reports set status=?,resolved_at=? where id in (${placeholders})`,
          [input.action === "dismiss" ? "dismissed" : "resolved", now, ...input.reportIds],
        ),
      ),
    );
  }

  const metadata = {
    ...(input.metadata ?? {}),
    reportIds: input.reportIds,
    decisionCode: input.decisionCode ?? null,
    confidence: input.confidence ?? null,
    policyVersion: input.policyVersion ?? null,
  };
  statements.push(
    binding.run(
      parameterizedSql(
        `insert into moderation_actions(
          id,actor_type,actor_id,action,target_type,target_id,reason,metadata_json,created_at
        ) values(?,?,?,?,?,?,?,?,?)`,
        [
          actionId,
          "api_token",
          actorId,
          input.action,
          input.targetType,
          input.targetId,
          input.reason,
          JSON.stringify(metadata),
          now,
        ],
      ),
    ),
  );

  await runDrizzleBatch(binding, statements);
  return {
    id: actionId,
    actorType: "api_token" as const,
    actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    metadata,
    createdAt: new Date(now).toISOString(),
  };
}
