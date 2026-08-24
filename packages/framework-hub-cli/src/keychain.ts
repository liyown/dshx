import { Entry } from "@napi-rs/keyring";

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

function entry(hub: string): KeyringEntry {
  return entryFactory(service(hub), "default");
}

function unavailable(operation: string, cause: unknown): Error {
  return new Error(
    `System keyring is unavailable while ${operation}. Ensure macOS Keychain, Linux Secret Service, or Windows Credential Manager is running, then retry.`,
    { cause },
  );
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
  try {
    return entry(hub).getPassword();
  } catch (error) {
    throw unavailable("reading the Hub token", error);
  }
}

export function saveToken(hub: string, token: string): void {
  try {
    entry(hub).setPassword(token);
  } catch (error) {
    throw unavailable("saving the Hub token", error);
  }
}

export function deleteToken(hub: string): void {
  try {
    entry(hub).deletePassword();
  } catch (error) {
    throw unavailable("deleting the Hub token", error);
  }
}
