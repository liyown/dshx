import { describe, expect, it } from "vitest";

import { redirectToLocale } from "./server";

describe("locale redirects", () => {
  it("permanently redirects the root to the English canonical", () => {
    const response = redirectToLocale(
      new Request("https://dshx.io/?source=direct", {
        headers: { "accept-language": "zh-CN,zh;q=0.9" },
      }),
    );

    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe("https://dshx.io/en?source=direct");
  });

  it("normalizes trailing slashes and default catalog parameters in one hop", () => {
    const response = redirectToLocale(
      new Request("https://dshx.io/en/plugins/?q=&category=&sort=featured&cursor="),
    );

    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe("https://dshx.io/en/plugins");
  });

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

  it.each(["/changelog", "/changelog/dshx-0-1-1"])(
    "redirects %s to the matching language",
    (path) => {
      const response = redirectToLocale(
        new Request(`https://dshx.io${path}`, {
          headers: { "accept-language": "zh-CN" },
        }),
      );
      expect(response?.status).toBe(302);
      expect(response?.headers.get("location")).toBe(`https://dshx.io/zh${path}`);
    },
  );

  it("normalizes a trailing slash on a changelog detail", () => {
    const response = redirectToLocale(new Request("https://dshx.io/en/changelog/dshx-0-1-1/"));
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe("https://dshx.io/en/changelog/dshx-0-1-1");
  });
});
