import { z } from "zod";

import { cliAuthorizationSchema, cliTokenExchangeSchema } from "@/lib/auth/cli.contracts";
import { defineOperation, type ApiOperationDefinition } from "@/lib/api/operation";

/**
 * Browser-assisted CLI authorization.
 *
 * The endpoints that start, exchange, inspect and revoke a token. Revocation is
 * public on purpose: an expired or unknown token still answers 204, so the CLI
 * can sign out without a valid credential.
 */

const authorizationStartedSchema = z.object({
  id: z.string(),
  authorizeUrl: z.string(),
  expiresAt: z.string(),
});

const tokenIssuedSchema = z.object({
  token: z.string(),
  tokenType: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.string(),
});

const tokenInspectionSchema = z.object({
  user: z.object({ id: z.string(), login: z.string(), role: z.string() }),
  token: z.object({
    prefix: z.string(),
    scopes: z.array(z.string()),
    expiresAt: z.union([z.string(), z.date()]),
  }),
});

export const cliOperations = {
  createCliAuthorization: defineOperation({
    operationId: "createCliAuthorization",
    path: "/api/cli/authorizations",
    method: "post",
    tag: "CLI authorization",
    summary: "Start a browser-assisted CLI authorization",
    auth: { via: "public" },
    spec: { body: cliAuthorizationSchema, status: 201, response: authorizationStartedSchema },
    responses: { 201: "Pending authorization and browser approval URL." },
    errors: [400],
  }),
  exchangeCliToken: defineOperation({
    operationId: "exchangeCliToken",
    path: "/api/cli/token",
    method: "post",
    tag: "CLI authorization",
    summary: "Exchange an approved authorization code for a token",
    auth: { via: "public" },
    spec: { body: cliTokenExchangeSchema, response: tokenIssuedSchema },
    responses: { 200: "Bearer token and its expiry." },
    errors: [400],
  }),
  inspectCliToken: defineOperation({
    operationId: "inspectCliToken",
    path: "/api/cli/token",
    method: "get",
    tag: "CLI authorization",
    summary: "Inspect the current bearer token",
    auth: { via: "bearer" },
    spec: { response: tokenInspectionSchema },
    responses: { 200: "Authenticated user and token metadata." },
    errors: [401],
  }),
  revokeCliToken: defineOperation({
    operationId: "revokeCliToken",
    path: "/api/cli/token",
    method: "delete",
    tag: "CLI authorization",
    summary: "Revoke the current bearer token",
    auth: { via: "public" },
    spec: {},
    responses: { 204: "The token was revoked." },
    errors: [401],
  }),
} satisfies Record<string, ApiOperationDefinition>;

export const cliOperationList: readonly ApiOperationDefinition[] = Object.values(cliOperations);
