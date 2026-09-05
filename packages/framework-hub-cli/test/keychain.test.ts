import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizedError } from "../src/errors.js";
import {
  deleteToken,
  readToken,
  saveToken,
  setKeyringEntryFactoryForTests,
  verifyNativeKeyringModule,
} from "../src/keychain.js";

const HUB = "https://dshx.io";
let stateDirectory: string;

beforeEach(() => {
  stateDirectory = mkdtempSync(join(tmpdir(), "dshx-test-credentials-"));
  vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", "");
});

afterEach(() => {
  setKeyringEntryFactoryForTests();
  vi.unstubAllEnvs();
  rmSync(stateDirectory, { recursive: true, force: true });
});

function fallbackFile(hub = HUB): string {
  const hash = createHash("sha256").update(new URL(hub).origin).digest("hex");
  return join(stateDirectory, "credentials", `${hash}.token`);
}

function writePreviewCredential(token: string): void {
  mkdirSync(dirname(fallbackFile()), { mode: 0o700 });
  writeFileSync(fallbackFile(), token, { mode: 0o600 });
}

function unavailableKeyring(): void {
  setKeyringEntryFactoryForTests(() => {
    throw new Error("Native backend unavailable");
  });
}

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

  it("rejects a keyring write that does not survive readback when fallback was not explicitly configured", () => {
    setKeyringEntryFactoryForTests(() => ({
      getPassword: () => null,
      setPassword: () => {},
      deletePassword: () => false,
    }));
    expect(() => saveToken(HUB, "test-unpersisted-token")).toThrowError(
      expect.objectContaining({
        issue: expect.objectContaining({ code: "keyring_persistence_failed" }),
      }),
    );
    expect(readdirSync(stateDirectory)).toEqual([]);
    expect(readToken(HUB)).toBeNull();
  });

  it("uses the preview.4 raw-token path when the keyring is unavailable", () => {
    vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", stateDirectory);
    unavailableKeyring();
    saveToken(`${HUB}/a/path`, "test-fallback-token");
    expect(readFileSync(fallbackFile(), "utf8")).toBe("test-fallback-token");
    expect(readToken(HUB)).toBe("test-fallback-token");
    expect(statSync(dirname(fallbackFile())).mode & 0o777).toBe(0o700);
    expect(statSync(fallbackFile()).mode & 0o777).toBe(0o600);
    expect(readdirSync(dirname(fallbackFile()))).toEqual([
      `${createHash("sha256").update(HUB).digest("hex")}.token`,
    ]);
  });

  it("reads a prior preview credential without writing it to the keyring", () => {
    vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", stateDirectory);
    writePreviewCredential("test-preview-credential");
    const setPassword = vi.fn();
    setKeyringEntryFactoryForTests(() => ({
      getPassword: () => null,
      setPassword,
      deletePassword: () => false,
    }));
    expect(readToken(HUB)).toBe("test-preview-credential");
    expect(setPassword).not.toHaveBeenCalled();
    expect(readToken("https://other.example.test")).toBeNull();
  });

  it("keeps valid keyring credentials ahead of fallback without altering either store", () => {
    vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", stateDirectory);
    writePreviewCredential("test-old-fallback");
    const setPassword = vi.fn();
    const deletePassword = vi.fn(() => true);
    setKeyringEntryFactoryForTests(() => ({
      getPassword: () => "test-valid-keyring",
      setPassword,
      deletePassword,
    }));
    expect(readToken(HUB)).toBe("test-valid-keyring");
    expect(setPassword).not.toHaveBeenCalled();
    expect(deletePassword).not.toHaveBeenCalled();
    expect(readFileSync(fallbackFile(), "utf8")).toBe("test-old-fallback");
  });

  it("removes a stale fallback only after verifying a successful keyring save", () => {
    vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", stateDirectory);
    writePreviewCredential("test-old-fallback");
    let stored: string | null = null;
    setKeyringEntryFactoryForTests(() => ({
      getPassword: () => stored,
      setPassword: (value) => {
        stored = value;
      },
      deletePassword: () => false,
    }));
    saveToken(HUB, "test-new-keyring");
    expect(readToken(HUB)).toBe("test-new-keyring");
    expect(existsSync(fallbackFile())).toBe(false);
  });

  it("does not report persistence success if an unwritable keyring still shadows the new fallback", () => {
    vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", stateDirectory);
    setKeyringEntryFactoryForTests(() => ({
      getPassword: () => "test-stale-keyring",
      setPassword: () => {},
      deletePassword: () => false,
    }));
    expect(() => saveToken(HUB, "test-new-fallback")).toThrowError(
      expect.objectContaining({
        issue: expect.objectContaining({ code: "keyring_persistence_failed" }),
      }),
    );
    expect(readToken(HUB)).toBe("test-stale-keyring");
    expect(readFileSync(fallbackFile(), "utf8")).toBe("test-new-fallback");
  });

  it("deletes both credential stores on logout", () => {
    vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", stateDirectory);
    writePreviewCredential("test-fallback");
    let stored: string | null = "test-keyring";
    setKeyringEntryFactoryForTests(() => ({
      getPassword: () => stored,
      setPassword: (value) => {
        stored = value;
      },
      deletePassword: () => {
        stored = null;
        return true;
      },
    }));
    deleteToken(HUB);
    expect(stored).toBeNull();
    expect(existsSync(fallbackFile())).toBe(false);
    expect(readToken(HUB)).toBeNull();
  });

  it("still deletes the fallback when the keyring delete fails and reports the incomplete cleanup", () => {
    vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", stateDirectory);
    writePreviewCredential("test-fallback");
    unavailableKeyring();
    expect(() => deleteToken(HUB)).toThrowError(
      expect.objectContaining({
        issue: expect.objectContaining({ code: "keyring_unavailable" }),
      }),
    );
    expect(existsSync(fallbackFile())).toBe(false);
  });

  it("never includes backend exception secrets in normalized errors", () => {
    const secret = "test-secret-must-not-appear";
    setKeyringEntryFactoryForTests(() => {
      throw new Error(`Backend echoed ${secret}`);
    });
    for (const operation of [
      () => readToken(HUB),
      () => saveToken(HUB, secret),
      () => deleteToken(HUB),
    ]) {
      try {
        operation();
        expect.unreachable("The unavailable backend must reject");
      } catch (error) {
        expect(JSON.stringify(normalizedError(error))).not.toContain(secret);
      }
    }
  });

  it("rejects credential directory symlinks without reading or modifying their contents", () => {
    vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", stateDirectory);
    const alternate = join(stateDirectory, "alternate");
    mkdirSync(alternate);
    symlinkSync(alternate, dirname(fallbackFile()), "dir");
    unavailableKeyring();
    expect(() => saveToken(HUB, "test-fallback")).toThrowError(
      expect.objectContaining({
        issue: expect.objectContaining({
          code: "credential_store_unavailable",
        }),
      }),
    );
    expect(readdirSync(alternate)).toEqual([]);
  });

  it("reads the persisted fallback in a new process using only an injected keyring", async () => {
    vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", stateDirectory);
    unavailableKeyring();
    saveToken(HUB, "test-restarted-credential");
    // Resolve the repository's .js source imports to .ts in a fresh Node
    // process. No installed dist tree or real credential backend is needed.
    const script = `
      import { registerHooks } from 'node:module';
      import { existsSync } from 'node:fs';
      registerHooks({ resolve(specifier, context, nextResolve) {
        if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL) {
          const source = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
          if (existsSync(source)) return nextResolve(source.href, context);
        }
        return nextResolve(specifier, context);
      }});
      const keychain = await import(process.argv[1]);
      keychain.setKeyringEntryFactoryForTests(() => { throw new Error('Fake keyring unavailable'); });
      if (keychain.readToken('https://dshx.io') !== 'test-restarted-credential') process.exit(1);
      process.stdout.write('verified');
    `;
    const result = await promisify(execFile)(
      process.execPath,
      [
        "--experimental-transform-types",
        "--input-type=module",
        "-e",
        script,
        new URL("../src/keychain.ts", import.meta.url).href,
      ],
      { env: { ...process.env, DSHX_HUB_OPS_STATE_DIR: stateDirectory } },
    );
    expect(result.stdout).toBe("verified");
    expect(result.stderr).not.toContain("test-restarted-credential");
  });
});
