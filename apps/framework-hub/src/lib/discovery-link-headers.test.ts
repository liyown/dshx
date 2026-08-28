import { describe, expect, it } from "vitest";

import {
  HOMEPAGE_DISCOVERY_LINKS,
  isHomepagePath,
  withHomepageDiscoveryHeaders,
} from "./discovery-link-headers";

describe("homepage discovery Link headers", () => {
  it.each(["/", "/en", "/en/", "/zh", "/zh/"])("recognizes homepage path %s", (path) => {
    expect(isHomepagePath(path)).toBe(true);
  });

  it.each(["/en/docs", "/zh/plugins", "/api/health", "/llms.txt"])(
    "does not claim non-homepage path %s",
    (path) => {
      expect(isHomepagePath(path)).toBe(false);
    },
  );

  it("adds every registered discovery relation to homepage responses", () => {
    const response = withHomepageDiscoveryHeaders(
      new Response("home", { headers: { "content-type": "text/html" } }),
      new Request("https://dshx.io/en"),
    );
    const link = response.headers.get("link") ?? "";

    expect(link).toBe(HOMEPAGE_DISCOVERY_LINKS.join(", "));
    expect(link).toContain('</.well-known/api-catalog>; rel="api-catalog"');
    expect(link).toContain('</openapi.json>; rel="service-desc"');
    expect(link).toContain('</api-docs.md>; rel="service-doc"');
    expect(link).toContain('</llms.txt>; rel="describedby"');
    expect(link).toContain('</auth.md>; rel="describedby"');
    expect(link).toContain('</.well-known/mcp/server-card.json>; rel="describedby"');
  });

  it("preserves an existing Link field and leaves other pages unchanged", () => {
    const original = new Response("page", { headers: { link: "</canonical>; rel=canonical" } });
    const homepage = withHomepageDiscoveryHeaders(
      original.clone(),
      new Request("https://dshx.io/"),
    );
    const docs = withHomepageDiscoveryHeaders(
      original.clone(),
      new Request("https://dshx.io/en/docs"),
    );

    expect(homepage.headers.get("link")).toMatch(/^<\/canonical>; rel=canonical, /);
    expect(docs.headers.get("link")).toBe("</canonical>; rel=canonical");
  });
});
