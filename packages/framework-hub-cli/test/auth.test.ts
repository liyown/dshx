import { describe, expect, it } from "vitest";

import { authorizationPageUrl } from "../src/auth.js";

describe("CLI authorization browser flow", () => {
  it("redirects the loopback callback into the localized Hub authorization page", () => {
    expect(
      new URL(
        authorizationPageUrl("https://dshx.io", "zh-CN,zh;q=0.9", "success"),
      ),
    ).toMatchObject({
      origin: "https://dshx.io",
      pathname: "/zh/auth/cli",
      search: "?status=success",
    });
    expect(
      new URL(
        authorizationPageUrl("https://dshx.io", "en-US", "error", "exchange"),
      ),
    ).toMatchObject({
      pathname: "/en/auth/cli",
      search: "?status=error&reason=exchange",
    });
  });
});
