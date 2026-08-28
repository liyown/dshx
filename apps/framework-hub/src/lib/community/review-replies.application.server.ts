import type { z } from "zod";

import type { replyCreateSchema } from "@/lib/catalog/contracts";
import type { Database } from "@/lib/db/client";
import { HttpError, uuid } from "@/lib/http";
import { sanitizeUserText } from "./contracts";
import {
  deleteOwnedReviewReply,
  findPublishedReview,
  findReplyByIdempotencyKey,
  insertReviewReply,
  listPublishedPluginReviews,
  updateOwnedReviewReply,
  usersBlockEachOther,
} from "./reviews.server";

type ReplyInput = z.infer<typeof replyCreateSchema>;

export async function listPluginReviews(
  db: Database,
  input: { slug: string; cursor: number; limit: number },
) {
  const rows = await listPublishedPluginReviews(db, input);
  return {
    items: rows.slice(0, input.limit),
    nextCursor: rows.length > input.limit ? rows[input.limit - 1]?.created_at : null,
  };
}

export async function createReviewReply(
  db: Database,
  input: ReplyInput & { reviewId: string; userId: string },
) {
  const review = await findPublishedReview(db, input.reviewId);
  if (!review) throw new HttpError(404, "Review not found", "review_not_found");
  if (await usersBlockEachOther(db, input.userId, review.userId))
    throw new HttpError(403, "This interaction is blocked", "user_blocked");
  const existing = await findReplyByIdempotencyKey(db, input.idempotencyKey);
  if (existing?.userId === input.userId) return { reply: existing, created: false };
  const reply = await insertReviewReply(db, {
    id: uuid(),
    reviewId: review.id,
    userId: input.userId,
    locale: input.locale,
    body: sanitizeUserText(input.body)!,
    idempotencyKey: input.idempotencyKey,
  });
  return { reply, created: true };
}

export async function editReviewReply(
  db: Database,
  input: ReplyInput & { replyId: string; userId: string },
) {
  const reply = await updateOwnedReviewReply(db, {
    id: input.replyId,
    userId: input.userId,
    body: sanitizeUserText(input.body)!,
    locale: input.locale,
  });
  if (!reply) throw new HttpError(404, "Reply not found", "reply_not_found");
  return reply;
}

export async function removeReviewReply(db: Database, replyId: string, userId: string) {
  const reply = await deleteOwnedReviewReply(db, replyId, userId);
  if (!reply) throw new HttpError(404, "Reply not found", "reply_not_found");
  return reply;
}
