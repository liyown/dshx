import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { assertLoopbackCallback, pkceChallenge } from "./cli.server";

describe("CLI authorization security", () => {
  it("accepts loopback HTTP callbacks and rejects remote callbacks", () => {
    expect(assertLoopbackCallback("http://127.0.0.1:43123/callback").hostname).toBe("127.0.0.1");
    expect(() => assertLoopbackCallback("https://example.com/callback")).toThrow("loopback");
  });

  it("uses the S256 PKCE challenge", async () => {
    const verifier = randomBytes(32).toString("base64url");
    expect(await pkceChallenge(verifier)).toBe(
      createHash("sha256").update(verifier).digest("base64url"),
    );
  });
});
