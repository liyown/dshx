import type { z } from "zod";

import { randomToken, sha256 } from "@/lib/auth/tokens.server";
import type { Database } from "@/lib/db/client";
import { HttpError, uuid } from "@/lib/http";
import type { claimCreateSchema, claimVerifySchema } from "./contracts";
import {
  findActivePluginClaim,
  findClaimablePlugin,
  findClaimByIdempotencyKey,
  insertPluginClaim,
  markPluginClaimVerified,
} from "./claims.repository.server";

type ClaimCreateInput = z.infer<typeof claimCreateSchema>;
type ClaimVerifyInput = z.infer<typeof claimVerifySchema>;

export async function createPluginClaim(
  db: Database,
  input: ClaimCreateInput & { userId: string; slug: string },
) {
  const plugin = await findClaimablePlugin(db, input.slug);
  if (!plugin?.primaryRepositoryId)
    throw new HttpError(404, "Plugin repository not found", "plugin_not_found");
  const existing = await findClaimByIdempotencyKey(db, input.userId, input.idempotencyKey);
  if (existing) return { status: 200, body: { claim: existing, challengeToken: null } };
  const challengeToken = randomToken("claim");
  const id = uuid();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
  await insertPluginClaim(db, {
    id,
    pluginId: plugin.id,
    userId: input.userId,
    repositoryId: plugin.primaryRepositoryId,
    challengeTokenHash: await sha256(challengeToken),
    idempotencyKey: input.idempotencyKey,
    expiresAt,
  });
  return {
    status: 201,
    body: {
      claim: { id, pluginId: plugin.id, status: "pending", expiresAt },
      challengeToken,
      file: {
        path: ".github/dshx-hub-claim.json",
        body: { pluginId: plugin.id, claimToken: challengeToken },
      },
    },
  };
}

export async function verifyPluginClaim(
  db: Database,
  input: ClaimVerifyInput & { userId: string; claimId: string },
  fetchSource: typeof fetch = fetch,
) {
  const row = await findActivePluginClaim(db, input.claimId, input.userId);
  if (!row) throw new HttpError(404, "Active claim not found", "claim_not_found");
  if ((await sha256(input.challengeToken)) !== row.claim.challengeTokenHash)
    throw new HttpError(422, "Challenge token does not match", "claim_token_mismatch");
  const rawUrl = `https://raw.githubusercontent.com/${row.repository.fullName}/${encodeURIComponent(row.repository.defaultBranch)}/${row.claim.challengePath}`;
  const response = await fetchSource(rawUrl, {
    headers: { accept: "application/vnd.github.raw+json" },
  });
  if (!response.ok)
    throw new HttpError(
      422,
      "Claim file is not present on the default branch",
      "claim_file_missing",
    );
  const file = (await response.json()) as { pluginId?: unknown; claimToken?: unknown };
  if (file.pluginId !== row.claim.pluginId || file.claimToken !== input.challengeToken)
    throw new HttpError(422, "Claim file contents do not match", "claim_file_mismatch");
  await markPluginClaimVerified(db, {
    claimId: row.claim.id,
    pluginId: row.claim.pluginId,
    userId: input.userId,
  });
  return { id: row.claim.id, status: "verified" as const };
}
