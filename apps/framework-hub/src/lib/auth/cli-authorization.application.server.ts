import type { z } from "zod";

import type { Database } from "@/lib/db/client";
import { HttpError, uuid } from "@/lib/http";
import type { cliAuthorizationSchema } from "./cli.contracts";
import {
  approveCliAuthorization,
  findPendingCliAuthorization,
  insertCliAuthorization,
} from "./cli.repository.server";
import { assertLoopbackCallback, getProfileForApproval } from "./cli.server";
import { randomToken, sha256 } from "./tokens.server";

type CliAuthorizationInput = z.infer<typeof cliAuthorizationSchema>;

export async function createCliAuthorization(
  db: Database,
  input: CliAuthorizationInput,
  site: string,
) {
  assertLoopbackCallback(input.callbackUrl);
  const id = uuid();
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await insertCliAuthorization(db, {
    id,
    stateHash: await sha256(input.state),
    codeChallenge: input.codeChallenge,
    callbackUrl: input.callbackUrl,
    requestedScopesJson: input.scopes,
    expiresAt,
  });
  const authorizeUrl = new URL(`/api/cli/authorizations/${id}/approve`, site);
  authorizeUrl.searchParams.set("state", input.state);
  return { id, authorizeUrl: authorizeUrl.toString(), expiresAt: expiresAt.toISOString() };
}

export async function validateCliAuthorizationRequest(
  db: Database,
  input: { authorizationId: string; state: string },
) {
  const authorization = await findPendingCliAuthorization(db, input.authorizationId);
  if (!authorization || (await sha256(input.state)) !== authorization.stateHash)
    throw new HttpError(400, "Authorization state is invalid or expired", "invalid_state");
  return authorization;
}

export async function approveValidatedCliAuthorization(
  db: Database,
  authorization: NonNullable<Awaited<ReturnType<typeof findPendingCliAuthorization>>>,
  input: { state: string; userId: string },
) {
  await getProfileForApproval(db, input.userId);
  const code = randomToken("code");
  await approveCliAuthorization(db, {
    id: authorization.id,
    userId: input.userId,
    exchangeCodeHash: await sha256(code),
  });
  const callback = new URL(authorization.callbackUrl);
  callback.searchParams.set("authorization_id", authorization.id);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", input.state);
  return callback;
}
