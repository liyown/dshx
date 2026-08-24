import { z } from "zod";

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
    value
      .normalize("NFC")
      // The marketplace rejects C0 controls while preserving tabs and newlines in user text.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/<\/?(?:script|style|iframe|object|embed|form|input|button)[^>]*>/gi, "")
      .trim()
  );
}
