import { z } from "zod";

import { api } from "./api.js";
import { apiProtocolVersion, readCliPackage } from "./capabilities.js";
import { CliError } from "./errors.js";

const authenticationSchema = z.object({
  user: z.object({ id: z.string().min(1) }),
  token: z.object({
    scopes: z.array(z.string().min(1)),
    expiresAt: z.string().datetime({ offset: true }),
  }),
});

/** A bounded, read-only gate; aggregation and business reads happen afterwards. */
export async function preflight(hub: string, expectedCliVersion?: string) {
  const cliPackage = await readCliPackage();
  if (
    expectedCliVersion !== undefined &&
    cliPackage.version !== expectedCliVersion
  )
    throw new CliError({
      code: "cli_version_mismatch",
      message:
        "The executing CLI version does not match the configured version.",
      retryable: false,
      repairHint:
        "Use the operator's configured CLI executable or update its expected version after verification.",
      details: { expected: expectedCliVersion, actual: cliPackage.version },
    });

  // The same authenticated read as auth status. Keep its request ID on invalid
  // responses, and allow ApiError to propagate unchanged on access failures.
  const response = await api<unknown>(hub, "/api/cli/token");
  const authentication = authenticationSchema.safeParse(response.data);
  if (!authentication.success)
    throw new CliError(
      {
        code: "invalid_hub_response",
        message: "Hub returned an invalid authentication status response.",
        retryable: true,
        repairHint:
          "Check the Hub authentication endpoint contract before retrying preflight.",
      },
      response.meta.requestId,
    );
  if (
    !authentication.data.token.scopes.includes("catalog:write") &&
    !authentication.data.token.scopes.includes("*")
  )
    throw new CliError(
      {
        code: "insufficient_scope",
        message: "The Hub credential does not grant catalog operations.",
        retryable: false,
        repairHint:
          "Authorize the CLI with catalog:write before starting operations.",
      },
      response.meta.requestId,
    );

  // Use an allowlist instead of returning the credential endpoint's raw body.
  return {
    ready: true as const,
    hub,
    package: cliPackage,
    apiProtocolVersion,
    authentication: {
      verified: true as const,
      scopes: authentication.data.token.scopes,
      expiresAt: authentication.data.token.expiresAt,
    },
    requestId: response.meta.requestId,
  };
}

export type PreflightResult = Awaited<ReturnType<typeof preflight>>;
