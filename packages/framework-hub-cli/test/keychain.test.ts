import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizedError } from "../src/errors.js";
import {
  deleteToken,
  readToken,
  saveToken,
  setKeyringEntryFactoryForTests,
  verifyNativeKeyringModule,
} from "../src/keychain.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  setKeyringEntryFactoryForTests();
  vi.unstubAllEnvs();
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("system keyring adapter", () => {
  it("loads the native module without accessing credentials", () => {
    expect(verifyNativeKeyringModule()).toBe(true);
  });

  it("uses an injected keyring in tests instead of real user credentials", () => {
    let token: string | null = null;
    setKeyringEntryFactoryForTests(() => ({
      getPassword: () => token,
      setPassword: (value) => {
        token = value;
      },
      deletePassword: () => {
        token = null;
        return true;
      },
    }));
    expect(readToken("https://dshx.io")).toBeNull();
    saveToken("https://dshx.io", "secret");
    expect(readToken("https://dshx.io")).toBe("secret");
    deleteToken("https://dshx.io");
    expect(readToken("https://dshx.io")).toBeNull();
  });

  it("returns a repair hint when the system keyring is unavailable", () => {
    setKeyringEntryFactoryForTests(() => {
      throw new Error("backend unavailable");
    });
    try {
      readToken("https://dshx.io");
      expect.unreachable("readToken should reject an unavailable keyring");
    } catch (error) {
      expect(normalizedError(error).error).toMatchObject({
        code: "keyring_unavailable",
        message: "System keyring is unavailable while reading the Hub token.",
        retryable: true,
        repairHint:
          "Ensure macOS Keychain, Linux Secret Service, or Windows Credential Manager is running, then retry.",
      });
    }
  });

  it("rejects a keyring write that does not persist", () => {
    setKeyringEntryFactoryForTests(() => ({
      getPassword: () => null,
      setPassword: () => undefined,
      deletePassword: () => false,
    }));
    expect(() => saveToken("https://dshx.io", "secret")).toThrowError(
      expect.objectContaining({
        issue: expect.objectContaining({
          code: "keyring_persistence_failed",
        }),
      }),
    );
  });

  it("uses a private operations-state fallback when a headless keyring silently drops writes", () => {
    const stateDirectory = mkdtempSync(join(tmpdir(), "dshx-hub-keyring-"));
    temporaryDirectories.push(stateDirectory);
    vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", stateDirectory);
    setKeyringEntryFactoryForTests(() => ({
      getPassword: () => null,
      setPassword: () => undefined,
      deletePassword: () => false,
    }));

    saveToken("https://dshx.io", "secret");
    expect(readToken("https://dshx.io")).toBe("secret");
    const credentials = join(stateDirectory, "credentials");
    const [credentialFile] = readdirSync(credentials);
    expect(credentialFile).toMatch(/^[a-f0-9]{64}\.token$/);
    expect(statSync(credentials).mode & 0o777).toBe(0o700);
    expect(statSync(join(credentials, credentialFile!)).mode & 0o777).toBe(
      0o600,
    );

    deleteToken("https://dshx.io");
    expect(readToken("https://dshx.io")).toBeNull();
    expect(readdirSync(credentials)).toEqual([]);
  });
});
