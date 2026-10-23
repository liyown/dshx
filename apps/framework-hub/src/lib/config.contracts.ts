import { z } from "zod";

/**
 * `/api/config` — the only public endpoint that tells the browser which
 * optional features this deployment has configured. Both the sign-in control
 * and the Turnstile widget read it, so the shape lives here rather than in each.
 */
export const publicConfigSchema = z.object({
  turnstileSiteKey: z.string().nullable(),
  githubAuthConfigured: z.boolean(),
});

export type PublicConfig = z.infer<typeof publicConfigSchema>;
