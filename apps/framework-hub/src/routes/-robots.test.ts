import { describe, expect, it } from "vitest";

import { robotsResponse } from "./robots[.]txt";

describe("robots discovery document", () => {
  it("always publishes the production sitemap without blocking public pages", async () => {
    const response = robotsResponse();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(body).toContain("User-agent: *\nAllow: /");
    expect(body).toContain("Disallow: /admin/");
    expect(body).toContain("Disallow: /api/ops/");
    expect(body).toContain("Sitemap: https://dshx.io/sitemap.xml");
    expect(body).not.toMatch(/Disallow: \/(?:en|zh|plugins|docs|operations)/);
    expect(body).not.toContain("dshx.dev");
  });
});
