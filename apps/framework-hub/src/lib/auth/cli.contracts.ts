import { z } from "zod";

export const cliAuthorizationSchema = z.object({
  callbackUrl: z.string().url().max(500),
  state: z.string().min(24).max(512),
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  scopes: z
    .array(z.enum(["catalog:write", "moderation:write", "users:write", "approvals:write"]))
    .min(1)
    .max(4),
});

export const cliTokenExchangeSchema = z.object({
  authorizationId: z.string().uuid(),
  code: z.string().min(24).max(512),
  codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
});

export type CliAuthorizationInput = z.infer<typeof cliAuthorizationSchema>;
export type CliTokenExchangeInput = z.infer<typeof cliTokenExchangeSchema>;
