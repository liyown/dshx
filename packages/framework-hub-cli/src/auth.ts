import { createServer, type ServerResponse } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import open from "open";

import { api } from "./api.js";
import { deleteToken, readToken, saveToken } from "./keychain.js";

const base64url = (value: Buffer) => value.toString("base64url");

type AuthorizationResult = {
  code: string;
  authorizationId: string;
  response: ServerResponse;
  acceptLanguage: string | undefined;
};

type AuthorizationFailure = "expired" | "incomplete" | "exchange";

export function authorizationPageUrl(
  hub: string,
  acceptLanguage: string | undefined,
  status: "success" | "error",
  reason?: AuthorizationFailure,
): string {
  const locale = (acceptLanguage ?? "")
    .split(",")
    .some((part) => /^\s*zh(?:-|\s|;|$)/i.test(part))
    ? "zh"
    : "en";
  const target = new URL(`/${locale}/auth/cli`, hub);
  target.searchParams.set("status", status);
  if (reason) target.searchParams.set("reason", reason);
  return target.toString();
}

function redirectAuthorizationPage(response: ServerResponse, location: string) {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(302, {
    location,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end();
}

export type BrowserOpener = (url: string) => Promise<unknown>;
export interface AuthorizationOutput {
  write(value: string): unknown;
}

export async function openAuthorizationUrl(
  url: string,
  opener: BrowserOpener = (target) => open(target, { wait: false }),
  output: AuthorizationOutput = process.stderr,
): Promise<boolean> {
  try {
    await opener(url);
    return true;
  } catch {
    output.write(`Unable to open a browser. Authorize at:\n${url}\n`);
    return false;
  }
}

export async function login(hub: string, scopes: string[]) {
  const state = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(32));
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let resolveCallback!: (value: AuthorizationResult) => void;
  let rejectCallback!: (error: Error) => void;
  const callback = new Promise<AuthorizationResult>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  let callbackSettled = false;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      response.writeHead(404).end("Not found");
      return;
    }
    const acceptLanguage = request.headers["accept-language"];
    if (callbackSettled) {
      redirectAuthorizationPage(
        response,
        authorizationPageUrl(hub, acceptLanguage, "error", "expired"),
      );
      return;
    }
    if (url.searchParams.get("state") !== state) {
      callbackSettled = true;
      redirectAuthorizationPage(
        response,
        authorizationPageUrl(hub, acceptLanguage, "error", "expired"),
      );
      rejectCallback(new Error("CLI authorization state mismatch"));
      return;
    }
    const code = url.searchParams.get("code");
    const authorizationId = url.searchParams.get("authorization_id");
    if (!code || !authorizationId) {
      callbackSettled = true;
      redirectAuthorizationPage(
        response,
        authorizationPageUrl(hub, acceptLanguage, "error", "incomplete"),
      );
      rejectCallback(new Error("Authorization response is incomplete"));
      return;
    }
    callbackSettled = true;
    resolveCallback({ code, authorizationId, response, acceptLanguage });
  });
  await new Promise<void>((resolve, reject) =>
    server.listen(0, "127.0.0.1", resolve).once("error", reject),
  );
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Unable to start loopback callback");
    const created = await api<{ authorizeUrl: string }>(
      hub,
      "/api/cli/authorizations",
      {
        method: "POST",
        body: JSON.stringify({
          callbackUrl: `http://127.0.0.1:${address.port}/callback`,
          state,
          codeChallenge: challenge,
          scopes,
        }),
      },
      false,
    );
    if (await openAuthorizationUrl(created.authorizeUrl))
      process.stderr.write("Browser opened. Complete GitHub authorization…\n");
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error("CLI authorization timed out")),
        5 * 60_000,
      );
    });
    const result = await Promise.race([callback, timeout]);
    try {
      const exchanged = await api<{ token: string; expiresAt: string }>(
        hub,
        "/api/cli/token",
        {
          method: "POST",
          body: JSON.stringify({
            authorizationId: result.authorizationId,
            code: result.code,
            codeVerifier: verifier,
          }),
        },
        false,
      );
      saveToken(hub, exchanged.token);
      redirectAuthorizationPage(
        result.response,
        authorizationPageUrl(hub, result.acceptLanguage, "success"),
      );
      return { expiresAt: exchanged.expiresAt };
    } catch (error) {
      redirectAuthorizationPage(
        result.response,
        authorizationPageUrl(hub, result.acceptLanguage, "error", "exchange"),
      );
      throw error;
    }
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    server.close();
  }
}

export async function status(hub: string) {
  return api(hub, "/api/cli/token");
}

export async function logout(hub: string) {
  const token = readToken(hub);
  if (token) await api(hub, "/api/cli/token", { method: "DELETE" });
  deleteToken(hub);
}
