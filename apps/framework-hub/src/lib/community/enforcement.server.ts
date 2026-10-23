import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";
import { uuid } from "@/lib/http";

/**
 * The one place a community enforcement decision changes state.
 *
 * Hiding a review, restoring it, banning a member — each is a state change plus
 * a ledger entry. Three callers need that pair: an operator's direct decision
 * (`applyModerationAction`), an approved effect (the approvals workflow), and
 * the appeal that asks for one. Each used to spell the SQL itself, so a
 * transition could be fixed on one path and missed on another.
 *
 * This module owns the statements. Callers compose them into their own batch
 * and add whatever else their decision requires.
 */

export type EnforcedContent = "review" | "reply";

/** Everything the moderation ledger can name as a subject. */
export type ModerationTarget = "plugin" | "review" | "reply" | "profile" | "collection" | "user";

/** What a ban or restriction does, in the vocabulary of the moderation ledger. */
export type UserAccess = "ban" | "restrict" | "unban" | "unrestrict";

export type EnforcementActor = {
  readonly type: "api_token" | "user";
  readonly id: string;
};

const CONTENT_TABLE: Readonly<Record<EnforcedContent, string>> = {
  review: "plugin_reviews",
  reply: "review_replies",
};

/** Hide or restore moderated content. */
export function contentStatusStatements(
  binding: Database,
  targetType: EnforcedContent,
  targetId: string,
  status: "hidden" | "published",
  now: number,
): BatchItem<"sqlite">[] {
  return [
    binding.run(
      parameterizedSql(`update ${CONTENT_TABLE[targetType]} set status=?,updated_at=? where id=?`, [
        status,
        now,
        targetId,
      ]),
    ),
  ];
}

/**
 * Ban, restrict, or lift a member's restriction.
 *
 * A ban and a restriction differ in the record they leave and the status they
 * set, not in how they are applied; lifting either one revokes whatever record
 * stands. Both paths that can change access — an operator's decision and an
 * approved effect — get the same statements.
 */
export function userAccessStatements(
  binding: Database,
  input: {
    readonly userId: string;
    readonly access: UserAccess;
    readonly reason: string;
    /** Required for ban and restrict; ignored when lifting. */
    readonly expiresAt: number | null;
    readonly actor: EnforcementActor;
  },
  now: number,
): BatchItem<"sqlite">[] {
  if (input.access === "unban" || input.access === "unrestrict") {
    return [
      binding.run(
        parameterizedSql(
          "update user_restrictions set revoked_at=? where user_id=? and revoked_at is null",
          [now, input.userId],
        ),
      ),
      binding.run(
        parameterizedSql("update user_profiles set status='active',updated_at=? where user_id=?", [
          now,
          input.userId,
        ]),
      ),
    ];
  }
  const banned = input.access === "ban";
  return [
    binding.run(
      parameterizedSql(
        `insert into user_restrictions(
          id,user_id,kind,reason,starts_at,expires_at,created_by_actor_type,created_by_actor_id
        ) values(?,?,?,?,?,?,?,?)`,
        [
          uuid(),
          input.userId,
          banned ? "ban" : "write",
          input.reason,
          now,
          input.expiresAt,
          input.actor.type,
          input.actor.id,
        ],
      ),
    ),
    binding.run(
      parameterizedSql("update user_profiles set status=?,updated_at=? where user_id=?", [
        banned ? "banned" : "restricted",
        now,
        input.userId,
      ]),
    ),
  ];
}

/** The ledger entry every enforcement decision writes, whoever made it. */
export function moderationRecordStatement(
  binding: Database,
  input: {
    /** The decision's own id, when the caller already returns it. */
    readonly id?: string;
    readonly actor: EnforcementActor;
    readonly action: string;
    readonly targetType: ModerationTarget;
    readonly targetId: string;
    readonly reason: string;
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly now: number;
  },
): BatchItem<"sqlite"> {
  return binding.run(
    parameterizedSql(
      `insert into moderation_actions(
        id,actor_type,actor_id,action,target_type,target_id,reason,metadata_json,created_at
      ) values(?,?,?,?,?,?,?,?,?)`,
      [
        input.id ?? uuid(),
        input.actor.type,
        input.actor.id,
        input.action,
        input.targetType,
        input.targetId,
        input.reason,
        JSON.stringify(input.metadata),
        input.now,
      ],
    ),
  );
}
