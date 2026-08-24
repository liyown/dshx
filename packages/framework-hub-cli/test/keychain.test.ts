import { afterEach, describe, expect, it } from "vitest";

import {
  deleteToken,
  readToken,
  saveToken,
  setKeyringEntryFactoryForTests,
  verifyNativeKeyringModule,
} from "../src/keychain.js";

afterEach(() => setKeyringEntryFactoryForTests());

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
    expect(() => readToken("https://dshx.io")).toThrow(
      "Ensure macOS Keychain, Linux Secret Service, or Windows Credential Manager is running",
    );
  });
});
