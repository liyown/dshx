import type { z } from "zod";
import type { BatchItem } from "drizzle-orm/batch";

import type { ApprovalCreateInput } from "@/lib/approvals/contracts";
import { createUserApproval } from "@/lib/approvals/service.server";
import type { moderationActionSchema } from "@/lib/catalog/contracts";
import type { Database } from "@/lib/db/client";
import { runDrizzleBatch } from "@/lib/db/batch";
import { parameterizedSql } from "@/lib/db/parameterized-sql";
import { HttpError, uuid } from "@/lib/http";
import { sanitizeUserText, type AppealRow } from "./contracts";
import {
  contentStatusStatements,
  moderationRecordStatement,
  userAccessStatements,
} from "./enforcement.server";

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

/**
 * The state change an operator's direct decision makes.
 *
 * A reversal that a person must approve — restoring content, lifting or
 * imposing an access change — never arrives here: the route turns it into an
 * approval instead, and the effect applies it through the same statements.
 */
function enforcementStatements(
  binding: Database,
  input: ModerationInput,
  actorId: string,
  now: number,
): BatchItem<"sqlite">[] {
  if (input.targetType === "review" || input.targetType === "reply") {
    if (input.action !== "hide" && input.action !== "restore") return [];
    return contentStatusStatements(
      binding,
      input.targetType,
      input.targetId,
      input.action === "hide" ? "hidden" : "published",
      now,
    );
  }
  if (
    input.targetType === "user" &&
    (input.action === "ban" ||
      input.action === "restrict" ||
      input.action === "unban" ||
      input.action === "unrestrict")
  ) {
    return userAccessStatements(
      binding,
      {
        userId: input.targetId,
        access: input.action,
        reason: input.reason,
        expiresAt: input.expiresAt ? Date.parse(input.expiresAt) : null,
        actor: { type: "api_token", id: actorId },
      },
      now,
    );
  }
  return [];
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
  const statements: BatchItem<"sqlite">[] = enforcementStatements(binding, input, actorId, now);

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
  const record = moderationRecordStatement(binding, {
    id: actionId,
    actor: { type: "api_token", id: actorId },
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    metadata,
    now,
  });
  statements.push(record);

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

/** An appeal always carries the status of the approval its decision waits on. */
const appealSelect = `select a.*,r.status approval_status,r.effect_status
  from moderation_appeals a left join approval_requests r on r.id=a.approval_request_id`;

/**
 * The approval effect that imposes a gated enforcement decision.
 *
 * An operator asking for approval to restore content or change access, and a
 * member appealing a decision, describe the same effects. Both build them here,
 * in the shapes the approvals workflow runs, so a direct decision and an
 * appealed one cannot drift into two meanings of "restore".
 */
export function enforcementEffect(input: {
  readonly action: "restore" | "ban" | "unban" | "unrestrict";
  readonly target: { readonly type: "review" | "reply" | "user"; readonly id: string };
  readonly reason: string;
}): ApprovalCreateInput["effect"] {
  if (input.action === "restore")
    return {
      kind: "restore_content",
      executionMode: "server",
      input: { targetType: input.target.type, targetId: input.target.id },
    };
  return {
    kind: "set_user_access",
    executionMode: "server",
    input: { userId: input.target.id, action: input.action, reason: input.reason },
  };
}

export async function listAppeals(binding: Database, userId: string) {
  const result = await binding.all<AppealRow>(
    parameterizedSql(`${appealSelect} where a.user_id=? order by a.created_at desc`, [userId]),
  );
  return { items: result };
}

/**
 * An appeal is a member asking for a reversal of a decision about them.
 *
 * It never changes state itself: it opens an approval whose effect is the
 * reversal, and the approval decides. The ownership check is what makes that
 * safe — only the member a decision was made against may appeal it.
 */
export async function createAppeal(
  binding: Database,
  userId: string,
  input: { moderationActionId: string; statement: string; idempotencyKey: string },
) {
  const existing = await binding.get<AppealRow>(
    parameterizedSql(`${appealSelect} where a.user_id=? and a.idempotency_key=?`, [
      userId,
      input.idempotencyKey,
    ]),
  );
  if (existing) return existing;
  const action = await binding.get<Record<string, unknown>>(
    parameterizedSql("select * from moderation_actions where id=?", [input.moderationActionId]),
  );
  if (!action)
    throw new HttpError(404, "Moderation action not found", "moderation_action_not_found");
  const targetType = String(action["target_type"]);
  const targetId = String(action["target_id"]);
  const actionName = String(action["action"]);
  let owned = targetType === "user" && targetId === userId;
  if (targetType === "review") {
    owned = Boolean(
      await binding.get(
        parameterizedSql("select id from plugin_reviews where id=? and user_id=?", [
          targetId,
          userId,
        ]),
      ),
    );
  }
  if (targetType === "reply") {
    owned = Boolean(
      await binding.get(
        parameterizedSql("select id from review_replies where id=? and user_id=?", [
          targetId,
          userId,
        ]),
      ),
    );
  }
  if (!owned) throw new HttpError(403, "This moderation action is not yours", "appeal_forbidden");

  const statement = sanitizeUserText(input.statement);
  if (!statement)
    throw new HttpError(422, "An appeal needs a statement", "invalid_appeal_statement");
  const appealId = uuid();
  let approval: Omit<ApprovalCreateInput, "idempotencyKey">;
  if (actionName === "hide" && (targetType === "review" || targetType === "reply")) {
    approval = {
      kind: "appeal_resolution",
      risk: "high",
      subjectType: targetType,
      subjectId: targetId,
      title: `Appeal to restore ${targetType}`,
      summary: statement,
      evidence: {
        appealId,
        moderationActionId: input.moderationActionId,
        statement: input.statement,
      },
      effect: enforcementEffect({
        action: "restore",
        target: { type: targetType, id: targetId },
        reason: "Approved moderation appeal",
      }),
      preconditions: { status: "hidden" },
      policyVersion: "dshx-community-1",
    };
  } else if (["restrict", "ban"].includes(actionName) && targetType === "user") {
    const banned = actionName === "ban";
    approval = {
      kind: "appeal_resolution",
      risk: "critical",
      subjectType: "user",
      subjectId: userId,
      title: `Appeal ${actionName} decision`,
      summary: statement,
      evidence: {
        appealId,
        moderationActionId: input.moderationActionId,
        statement: input.statement,
      },
      effect: enforcementEffect({
        action: banned ? "unban" : "unrestrict",
        target: { type: "user", id: userId },
        reason: "Approved moderation appeal",
      }),
      preconditions: { status: banned ? "banned" : "restricted" },
      policyVersion: "dshx-community-1",
    };
  } else {
    throw new HttpError(409, "This moderation action cannot be appealed", "appeal_not_supported");
  }
  const approvalResult = await createUserApproval(binding, userId, {
    ...approval,
    idempotencyKey: `appeal:${userId}:${input.idempotencyKey}`,
  });
  await binding.run(
    parameterizedSql(
      `insert into moderation_appeals(
        id,user_id,moderation_action_id,statement,status,idempotency_key,approval_request_id,created_at
       ) values(?,?,?,?,?,?,?,?)`,
      [
        appealId,
        userId,
        input.moderationActionId,
        statement,
        "pending",
        input.idempotencyKey,
        approvalResult.id,
        Date.now(),
      ],
    ),
  );
  const appeal = await binding.get<AppealRow>(
    parameterizedSql(`${appealSelect} where a.id=?`, [appealId]),
  );
  if (!appeal) throw new HttpError(500, "Appeal could not be read back", "appeal_read_failed");
  return appeal;
}
