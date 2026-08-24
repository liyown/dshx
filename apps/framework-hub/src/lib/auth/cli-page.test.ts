import { describe, expect, it } from "vitest";

import {
  cliAuthorizationPageResponse,
  isSafeCliReturnTo,
  normalizeCliAuthorizationSearch,
} from "./cli-page";

describe("CLI authorization page routing", () => {
  it("routes browser authorization states to the preferred locale", () => {
    const response = cliAuthorizationPageResponse(
      new Request("https://dshx.io/api/cli/authorizations/example/approve", {
        headers: { "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" },
      }),
      {
        status: "connecting",
        returnTo: "/api/cli/authorizations/example/approve?state=secret-state",
      },
    );
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/zh/auth/cli");
    expect(location.searchParams.get("status")).toBe("connecting");
    expect(location.searchParams.get("returnTo")).toBe(
      "/api/cli/authorizations/example/approve?state=secret-state",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("accepts only the CLI approval callback path", () => {
    expect(isSafeCliReturnTo("/api/cli/authorizations/example/approve?state=state")).toBe(true);
    expect(isSafeCliReturnTo("https://attacker.example/approve")).toBe(false);
    expect(isSafeCliReturnTo("//attacker.example/approve")).toBe(false);
    expect(isSafeCliReturnTo("/api/auth/sign-in/social")).toBe(false);
  });

  it("turns malformed page state into a safe generic error", () => {
    expect(
      normalizeCliAuthorizationSearch({
        status: "approved",
        reason: "database-details",
        returnTo: "https://attacker.example",
      }),
    ).toEqual({ status: "error" });
  });
});
