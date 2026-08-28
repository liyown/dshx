import { describe, expect, it } from "vitest";

import {
  HUB_AUTH_SCOPES,
  authDiscoveryHeaders,
  buildAuthMarkdown,
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
} from "./auth-discovery";
import { serveAuthorizationServerMetadata } from "@/routes/[.]well-known/oauth-authorization-server";
import { serveProtectedResourceMetadata } from "@/routes/[.]well-known/oauth-protected-resource";
import { serveAuthMarkdown } from "@/routes/auth[.]md";

const context = { cloudflare: { SITE_URL: "https://dshx.io/" } };

describe("Auth.md discovery", () => {
  it("publishes complete protected-resource metadata", () => {
    expect(buildProtectedResourceMetadata("https://dshx.io/")).toEqual({
      resource: "https://dshx.io",
      authorization_servers: ["https://dshx.io"],
      scopes_supported: HUB_AUTH_SCOPES,
      bearer_methods_supported: ["header"],
      resource_name: "DSHX Hub Operations API",
      resource_documentation: "https://dshx.io/auth.md",
    });
  });

  it("keeps the advertised authorization server and issuer identical", () => {
    const resource = buildProtectedResourceMetadata("https://dshx.io");
    const authorization = buildAuthorizationServerMetadata("https://dshx.io/");

    expect(authorization.issuer).toBe(resource.authorization_servers[0]);
    expect(authorization.agent_auth).toMatchObject({
      skill: "https://dshx.io/auth.md",
      register_uri: "https://dshx.io/api/cli/authorizations",
      credential_types_supported: ["access_token"],
      registration_methods_supported: ["browser_pkce"],
      browser_pkce: {
        human_approval_required: true,
        code_challenge_method: "S256",
        token_uri: "https://dshx.io/api/cli/token",
      },
    });
    expect(JSON.stringify(authorization)).not.toMatch(
      /identity_assertion|id-jag|verified_email|anonymous/,
    );
  });

  it("serves a self-contained Markdown procedure without performing registration", async () => {
    const response = serveAuthMarkdown(new Request("https://preview.invalid/auth.md"), context);
    const markdown = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(markdown).toMatch(/^# .*auth\.md/m);
    expect(markdown).toContain("/api/cli/authorizations");
    expect(markdown).toContain("browser-assisted PKCE");
    expect(markdown).toContain("Authorization: Bearer <token>");
    expect(markdown).toContain("Passive scanners must not call the registration endpoint");
    expect(markdown).toBe(buildAuthMarkdown("https://dshx.io"));
  });

  it("changes the ETag when the advertised origin changes", () => {
    const localBody = buildAuthMarkdown("http://localhost:8787");
    const productionBody = buildAuthMarkdown("https://dshx.io");

    expect(authDiscoveryHeaders("markdown", localBody).get("etag")).not.toBe(
      authDiscoveryHeaders("markdown", productionBody).get("etag"),
    );
  });

  it("serves both metadata documents over GET and HEAD", async () => {
    const resourceRequest = new Request(
      "https://preview.invalid/.well-known/oauth-protected-resource",
    );
    const authorizationRequest = new Request(
      "https://preview.invalid/.well-known/oauth-authorization-server",
    );
    const resource = serveProtectedResourceMetadata(resourceRequest, context);
    const resourceHead = serveProtectedResourceMetadata(resourceRequest, context, false);
    const authorization = serveAuthorizationServerMetadata(authorizationRequest, context);
    const authorizationHead = serveAuthorizationServerMetadata(
      authorizationRequest,
      context,
      false,
    );

    expect(resource.status).toBe(200);
    expect(resource.headers.get("content-type")).toBe("application/json");
    await expect(resource.json()).resolves.toMatchObject({ resource: "https://dshx.io" });
    expect(await resourceHead.text()).toBe("");

    expect(authorization.status).toBe(200);
    expect(authorization.headers.get("content-type")).toBe("application/json");
    await expect(authorization.json()).resolves.toMatchObject({ issuer: "https://dshx.io" });
    expect(await authorizationHead.text()).toBe("");
  });
});
