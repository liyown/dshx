import { z } from "zod";

/**
 * `/api/auth/get-session` as the header reads it. better-auth owns the payload;
 * this is the part of it the hub renders, parsed once so a signed-in header
 * does not read fields the session does not guarantee.
 */
export const publicSessionSchema = z.object({ user: z.object({ name: z.string() }) }).nullable();

export type PublicSession = z.infer<typeof publicSessionSchema>;
