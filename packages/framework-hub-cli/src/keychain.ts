import { Entry } from "@napi-rs/keyring";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { CliError } from "./errors.js";

interface KeyringEntry {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): boolean;
}

export type KeyringEntryFactory = (
  service: string,
  account: string,
) => KeyringEntry;

const systemEntryFactory: KeyringEntryFactory = (service, account) =>
  new Entry(service, account);
let entryFactory = systemEntryFactory;

const service = (hub: string) => `dshx-hub:${new URL(hub).origin}`;
const operationsStateDirectoryEnvironment = "DSHX_HUB_OPS_STATE_DIR";

function entry(hub: string): KeyringEntry {
  return entryFactory(service(hub), "default");
}

function unavailable(operation: string, cause: unknown): CliError {
  return new CliError({
    code: "keyring_unavailable",
    message: `System keyring is unavailable while ${operation}.`,
    retryable: true,
    repairHint:
      "Ensure macOS Keychain, Linux Secret Service, or Windows Credential Manager is running, then retry.",
    details: {
      operation,
      cause: cause instanceof Error ? cause.message : String(cause),
    },
  });
}

function persistenceFailed(cause?: unknown): CliError {
  return new CliError({
    code: "keyring_persistence_failed",
    message: "System keyring did not persist the Hub token.",
    retryable: true,
    repairHint: `Run auth login in an interactive desktop session, or set ${operationsStateDirectoryEnvironment} for the permission-restricted operations credential fallback.`,
    ...(cause === undefined
      ? {}
      : {
          details: {
            cause: cause instanceof Error ? cause.message : String(cause),
          },
        }),
  });
}

function credentialStoreUnavailable(
  operation: string,
  cause: unknown,
): CliError {
  return new CliError({
    code: "credential_store_unavailable",
    message: `The operations credential fallback is unavailable while ${operation}.`,
    retryable: true,
    repairHint: `Ensure ${operationsStateDirectoryEnvironment} is a private writable directory, then retry.`,
    details: {
      operation,
      cause: cause instanceof Error ? cause.message : String(cause),
    },
  });
}

function fallbackPath(hub: string): string | undefined {
  const stateDirectory =
    process.env[operationsStateDirectoryEnvironment]?.trim();
  if (!stateDirectory) return undefined;
  const originHash = createHash("sha256")
    .update(new URL(hub).origin)
    .digest("hex");
  return join(stateDirectory, "credentials", `${originHash}.token`);
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function ensureCredentialDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink())
    throw new Error("Credential directory must be a real directory.");
  chmodSync(path, 0o700);
}

function readFallbackToken(hub: string): string | null {
  const path = fallbackPath(hub);
  if (!path) return null;
  try {
    const stats = lstatSync(path);
    if (!stats.isFile() || stats.isSymbolicLink())
      throw new Error("Credential path must be a regular file.");
    chmodSync(path, 0o600);
    const token = readFileSync(path, "utf8");
    return token || null;
  } catch (error) {
    if (isMissing(error)) return null;
    throw credentialStoreUnavailable("reading the Hub token", error);
  }
}

function writeFallbackToken(hub: string, token: string): boolean {
  const path = fallbackPath(hub);
  if (!path) return false;
  const directory = dirname(path);
  const temporaryPath = join(
    directory,
    `.token-${process.pid}-${randomBytes(8).toString("hex")}.tmp`,
  );
  try {
    ensureCredentialDirectory(directory);
    writeFileSync(temporaryPath, token, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, path);
    chmodSync(path, 0o600);
    if (readFallbackToken(hub) !== token)
      throw new Error("Credential fallback failed its write verification.");
    return true;
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if (!isMissing(cleanupError)) {
        // Preserve the original persistence failure; the explicit temporary
        // name remains confined to the private credential directory.
      }
    }
    throw credentialStoreUnavailable("saving the Hub token", error);
  }
}

function deleteFallbackToken(hub: string): void {
  const path = fallbackPath(hub);
  if (!path) return;
  try {
    unlinkSync(path);
  } catch (error) {
    if (!isMissing(error))
      throw credentialStoreUnavailable("deleting the Hub token", error);
  }
}

/** Inject a fake credential backend in tests without touching user credentials. */
export function setKeyringEntryFactoryForTests(
  factory?: KeyringEntryFactory,
): void {
  entryFactory = factory ?? systemEntryFactory;
}

/** Load the native module without reading or writing credentials. */
export function verifyNativeKeyringModule(): boolean {
  return typeof Entry === "function";
}

export function readToken(hub: string): string | null {
  let keyringFailure: unknown;
  try {
    const token = entry(hub).getPassword();
    if (token) return token;
  } catch (error) {
    keyringFailure = error;
  }
  const fallback = readFallbackToken(hub);
  if (fallback) return fallback;
  if (keyringFailure !== undefined)
    throw unavailable("reading the Hub token", keyringFailure);
  return null;
}

export function saveToken(hub: string, token: string): void {
  let keyringFailure: unknown;
  try {
    const target = entry(hub);
    target.setPassword(token);
    if (target.getPassword() === token) {
      deleteFallbackToken(hub);
      return;
    }
    keyringFailure = new Error(
      "Keyring write returned successfully but failed verification.",
    );
  } catch (error) {
    keyringFailure = error;
  }
  if (writeFallbackToken(hub, token)) return;
  throw persistenceFailed(keyringFailure);
}

export function deleteToken(hub: string): void {
  let keyringFailure: unknown;
  try {
    entry(hub).deletePassword();
  } catch (error) {
    keyringFailure = error;
  }
  deleteFallbackToken(hub);
  if (keyringFailure !== undefined)
    throw unavailable("deleting the Hub token", keyringFailure);
}
