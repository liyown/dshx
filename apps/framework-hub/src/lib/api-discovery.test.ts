import { describe, expect, it } from "vitest";

import {
  API_CATALOG_MEDIA_TYPE,
  buildApiCatalog,
  buildApiDocs,
  buildOpenApiDocument,
} from "./api-discovery";
import { serveApiCatalog } from "@/routes/[.]well-known/api-catalog";
import { serveApiDocs } from "@/routes/api-docs[.]md";
import { serveOpenApi } from "@/routes/openapi[.]json";

const context = { cloudflare: { SITE_URL: "https://dshx.io/" } };

describe("RFC 9727 API discovery", () => {
  it("publishes public catalog and operations entries with the required relations", () => {
    const document = buildApiCatalog("https://dshx.io/");

    expect(document.linkset).toHaveLength(2);
    for (const entry of document.linkset) {
      expect(entry.anchor).toMatch(/^https:\/\/dshx\.io\/api\//);
      expect(entry["service-desc"]).toEqual([
        {
          href: "https://dshx.io/openapi.json",
          type: "application/vnd.oai.openapi+json;version=3.1",
        },
      ]);
      expect(entry["service-doc"][0]).toMatchObject({
        href: expect.stringMatching(/^https:\/\/dshx\.io\/api-docs\.md#/),
        type: "text/markdown",
      });
      expect(entry.status?.[0]?.href).toMatch(/^https:\/\/dshx\.io\/api\//);
    }

    expect(JSON.stringify(document)).not.toMatch(/\/api\/(?:admin|me|claims|reviews)/);
  });

  it("serves GET and HEAD with the profiled Linkset media type and discovery link", async () => {
    const request = new Request("https://preview.invalid/.well-known/api-catalog");
    const get = serveApiCatalog(request, context);
    const head = serveApiCatalog(request, context, false);

    expect(get.status).toBe(200);
    expect(get.headers.get("content-type")).toBe(API_CATALOG_MEDIA_TYPE);
    expect(get.headers.get("link")).toContain('rel="api-catalog"');
    await expect(get.json()).resolves.toEqual(buildApiCatalog("https://dshx.io"));

    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toBe(API_CATALOG_MEDIA_TYPE);
    expect(head.headers.get("link")).toContain('rel="api-catalog"');
    expect(await head.text()).toBe("");
  });

  it("publishes a valid aggregate OpenAPI 3.1 document without private admin paths", async () => {
    const document = buildOpenApiDocument("https://dshx.io/");
    expect(document.openapi).toBe("3.1.0");
    expect(document.servers).toEqual([{ url: "https://dshx.io" }]);
    expect(document.paths).toHaveProperty("/api/plugins");
    expect(document.paths).toHaveProperty("/api/ops/v1/status");
    expect(document.paths).toHaveProperty("/api/cli/token");
    expect(document.paths).not.toHaveProperty("/api/admin/approvals");

    const response = serveOpenApi(new Request("https://preview.invalid/openapi.json"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.oai.openapi+json;version=3.1",
    );
    await expect(response.json()).resolves.toMatchObject({
      openapi: "3.1.0",
      servers: [{ url: "https://dshx.io" }],
    });
  });

  it("serves human-readable documentation for every service-doc relation", async () => {
    const response = serveApiDocs(new Request("https://preview.invalid/api-docs.md"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("link")).toContain('rel="service-desc"');
    expect(await response.text()).toBe(buildApiDocs("https://dshx.io"));
  });

  it("returns 304 for matching validators", () => {
    const initial = serveApiCatalog(
      new Request("https://dshx.io/.well-known/api-catalog"),
      context,
    );
    const response = serveApiCatalog(
      new Request("https://dshx.io/.well-known/api-catalog", {
        headers: { "if-none-match": initial.headers.get("etag") ?? "" },
      }),
      context,
    );
    expect(response.status).toBe(304);
    expect(response.headers.has("content-length")).toBe(false);
  });
});
