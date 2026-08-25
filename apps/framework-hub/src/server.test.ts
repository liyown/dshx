import { describe, expect, it } from "vitest";

import { redirectToLocale } from "./server";

describe("locale redirects", () => {
  it("preserves nested documentation paths, search, and hash", () => {
    const response = redirectToLocale(
      new Request("https://dshx.io/docs/settings?source=package#state", {
        headers: { "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" },
      }),
    );

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe(
      "https://dshx.io/zh/docs/settings?source=package#state",
    );
  });

  it("does not redirect an already localized documentation chapter", () => {
    expect(redirectToLocale(new Request("https://dshx.io/en/docs/conversation"))).toBeUndefined();
  });

  it("does not claim unrelated unlocalized paths", () => {
    expect(redirectToLocale(new Request("https://dshx.io/account"))).toBeUndefined();
  });
});
