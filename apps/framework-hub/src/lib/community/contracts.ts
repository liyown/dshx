import { z } from "zod";
import sanitizeHtml from "sanitize-html";

const writeProof = {
  turnstileToken: z.string().min(1).max(2_048),
  idempotencyKey: z.string().trim().min(8).max(200),
};

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(500).nullable().optional(),
  preferredLocale: z.enum(["en", "zh"]),
  ...writeProof,
});

export const collectionCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  visibility: z.enum(["public", "private"]).default("public"),
  ...writeProof,
});

export const collectionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  visibility: z.enum(["public", "private"]).optional(),
  turnstileToken: writeProof.turnstileToken,
  idempotencyKey: writeProof.idempotencyKey,
});

export const relationshipWriteSchema = z.object(writeProof);

export const submissionCreateSchema = z.object({
  repositoryUrl: z
    .string()
    .url()
    .max(2_048)
    .refine((value) => new URL(value).hostname.toLowerCase() === "github.com", {
      message: "Only GitHub repository URLs are accepted",
    }),
  ...writeProof,
});

export const appealCreateSchema = z.object({
  moderationActionId: z.string().uuid(),
  statement: z.string().trim().min(20).max(4_000),
  ...writeProof,
});

export const accountDeleteSchema = z.object({
  confirmation: z.literal("DELETE"),
  ...writeProof,
});

export const notificationReadSchema = z.object(writeProof);

export function sanitizeUserText(value: string | null | undefined) {
  if (value == null) return null;
  return (
    sanitizeHtml(value.normalize("NFC"), {
      allowedTags: [],
      allowedAttributes: {},
    })
      // The marketplace rejects C0 controls while preserving tabs and newlines in user text.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .trim()
  );
}

/**
 * What the account pages read back. Each schema is the answer of one endpoint
 * group: the browser parses with it and the route types its handler with it.
 * The SQL rows are declared as these types where they are selected, so a column
 * that disappears stops the route compiling rather than the page rendering.
 */

export const relationshipPluginSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  package_name: z.string(),
  created_at: z.number(),
});

export const relationshipPublisherSchema = z.object({
  id: z.string(),
  login: z.string(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  created_at: z.number(),
});

/** `/api/me/relationships` — the three follow lists the account shell counts. */
export const relationshipsSchema = z.object({
  bookmarks: z.array(relationshipPluginSchema),
  pluginFollows: z.array(relationshipPluginSchema),
  publisherFollows: z.array(relationshipPublisherSchema),
});

export const notificationSchema = z.object({
  id: z.string(),
  kind: z.string(),
  actor_user_id: z.string().nullable(),
  subject_type: z.string(),
  subject_id: z.string(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.number(),
  is_read: z.number(),
});

export const notificationsPageSchema = z.object({ items: z.array(notificationSchema) });

export const submissionSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  repository_url: z.string(),
  repository_full_name: z.string(),
  status: z.string(),
  source_hash: z.string().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
});

export const submissionsPageSchema = z.object({ items: z.array(submissionSchema) });

export const collectionRecordSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  visibility: z.enum(["public", "private"]),
  created_at: z.number(),
  updated_at: z.number(),
});

/** The owner's list: the record plus how many plugins it holds. */
export const collectionSummarySchema = collectionRecordSchema.extend({ plugin_count: z.number() });

export const collectionsPageSchema = z.object({ items: z.array(collectionSummarySchema) });

export const collectionPluginSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  package_name: z.string(),
  latest_version: z.string(),
  badge: z.string(),
  sort_order: z.number(),
  added_at: z.number(),
});

/** `/api/me/collections/$id` and the collection writes answer the owned detail. */
export const collectionDetailSchema = z.object({
  collection: collectionRecordSchema.extend({ owner_login: z.string(), owner_name: z.string() }),
  plugins: z.array(collectionPluginSchema),
});

export const appealSchema = z.object({
  id: z.string(),
  moderation_action_id: z.string(),
  approval_request_id: z.string().nullable(),
  statement: z.string(),
  status: z.string(),
  approval_status: z.string().nullable(),
  effect_status: z.string().nullable(),
  created_at: z.number(),
  resolved_at: z.number().nullable(),
});

export const appealsPageSchema = z.object({ items: z.array(appealSchema) });

/** `/api/me/profile` — the profile row joined to its account identity. */
export const profileSchema = z.object({
  user_id: z.string(),
  github_login: z.string(),
  role: z.string(),
  status: z.string(),
  preferred_locale: z.enum(["en", "zh"]),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  unread_notifications: z.number(),
});

export const pluginRelationshipResultSchema = z.object({
  pluginId: z.string(),
  kind: z.enum(["bookmark", "follow"]),
  enabled: z.boolean(),
});

export const publisherFollowResultSchema = z.object({
  publisherId: z.string(),
  enabled: z.boolean(),
});

export const userBlockResultSchema = z.object({
  blockedUserId: z.string(),
  enabled: z.boolean(),
});

export const notificationReadResultSchema = z.object({ id: z.string(), read: z.boolean() });

export const accountDeletionSchema = z.object({ deleted: z.boolean(), anonymized: z.boolean() });

export const collectionDeletionSchema = z.object({ id: z.string(), deleted: z.boolean() });

/** `/api/community/verification` — the state a Turnstile widget polls and writes. */
export const communityVerificationSchema = z.object({
  verified: z.boolean(),
  expiresAt: z.string().nullable(),
});

export type Relationships = z.infer<typeof relationshipsSchema>;
export type RelationshipPlugin = z.infer<typeof relationshipPluginSchema>;
export type RelationshipPublisher = z.infer<typeof relationshipPublisherSchema>;
export type NotificationRow = z.infer<typeof notificationSchema>;
export type SubmissionRow = z.infer<typeof submissionSchema>;
export type CollectionRecord = z.infer<typeof collectionRecordSchema>;
export type CollectionDetailRecord = z.infer<typeof collectionDetailSchema>["collection"];
export type CollectionSummary = z.infer<typeof collectionSummarySchema>;
export type CollectionPlugin = z.infer<typeof collectionPluginSchema>;
export type AppealRow = z.infer<typeof appealSchema>;
export type ProfileRow = z.infer<typeof profileSchema>;
