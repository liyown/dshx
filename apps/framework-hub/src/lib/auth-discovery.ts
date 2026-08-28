export const HUB_AUTH_SCOPES = [
  "catalog:write",
  "moderation:write",
  "users:write",
  "approvals:write",
] as const;

function normalizeOrigin(origin: string): string {
  return new URL(origin).origin;
}

function at(origin: string, path: string): string {
  return new URL(path, `${normalizeOrigin(origin)}/`).href;
}

export function buildProtectedResourceMetadata(origin: string) {
  const issuer = normalizeOrigin(origin);
  return {
    resource: issuer,
    authorization_servers: [issuer],
    scopes_supported: HUB_AUTH_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "DSHX Hub Operations API",
    resource_documentation: at(origin, "/auth.md"),
  } as const;
}

export function buildAuthorizationServerMetadata(origin: string) {
  const issuer = normalizeOrigin(origin);
  const registerUri = at(origin, "/api/cli/authorizations");
  const tokenUri = at(origin, "/api/cli/token");
  return {
    issuer,
    token_endpoint: tokenUri,
    scopes_supported: HUB_AUTH_SCOPES,
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    agent_auth: {
      skill: at(origin, "/auth.md"),
      register_uri: registerUri,
      credential_types_supported: ["access_token"],
      registration_methods_supported: ["browser_pkce"],
      browser_pkce: {
        register_uri: registerUri,
        token_uri: tokenUri,
        credential_type: "access_token",
        code_challenge_method: "S256",
        callback_uri_scheme: "http",
        callback_hosts_supported: ["127.0.0.1", "localhost", "[::1]"],
        identity_provider: "github",
        human_approval_required: true,
        required_user_roles: ["operator", "moderator", "admin"],
        revocation_uri: tokenUri,
        revocation_method: "DELETE",
      },
    },
  } as const;
}

export function buildAuthMarkdown(origin: string): string {
  const site = normalizeOrigin(origin);
  return `# DSHX Hub auth.md

This document explains how an automated Agent acting for an approved DSHX Hub operator can obtain and use a scoped Hub credential.

Passive scanners must not call the registration endpoint. Registration creates a short-lived authorization record and starts a human approval flow.

## Discover

1. Read Protected Resource Metadata at ${site}/.well-known/oauth-protected-resource.
2. Follow its authorization server to ${site}/.well-known/oauth-authorization-server.
3. Read the \`agent_auth\` block and select the \`browser_pkce\` registration method.

The protected resource is ${site}. Credentials are opaque bearer access tokens and must be sent only in the HTTP \`Authorization\` header.

## Audience and supported method

The registration audience is an Agent or the \`dshx-hub\` CLI acting with an approved human operator. The supported method is browser-assisted PKCE with GitHub sign-in and explicit human approval.

The service does not support anonymous registration, ID-JAG identity assertions, verified-email claims, client credentials, or unattended account creation. The approving user must already have the \`operator\`, \`moderator\`, or \`admin\` Hub role.

## Scopes

- \`catalog:write\` — inspect and maintain catalog facts, submissions, reports, media, and audits.
- \`moderation:write\` — operate the moderation queue.
- \`users:write\` — update Hub user roles.
- \`approvals:write\` — operate approval workflows.

Request only the scopes required for the task. Routine catalog maintenance uses \`catalog:write\`.

## Register with browser-assisted PKCE

Generate a cryptographically random \`state\` of 24–512 characters and a PKCE \`code_verifier\` of 43–128 unreserved characters. Compute \`codeChallenge = BASE64URL(SHA256(code_verifier))\` without padding. Start an HTTP loopback listener on \`127.0.0.1\`, \`localhost\`, or \`[::1]\`.

Send JSON to the registration endpoint:

\`\`\`http
POST ${site}/api/cli/authorizations
Content-Type: application/json

{
  "callbackUrl": "http://127.0.0.1:43123/callback",
  "state": "<random-state>",
  "codeChallenge": "<base64url-sha256-challenge>",
  "scopes": ["catalog:write"]
}
\`\`\`

A successful response is HTTP 201 with \`id\`, \`authorizeUrl\`, and \`expiresAt\`. Show or open \`authorizeUrl\` for the human operator. The human signs in with GitHub and approves the request. Do not scrape or automate the GitHub login page.

The Hub redirects the browser to the loopback callback with \`authorization_id\`, one-time \`code\`, and \`state\`. Reject the callback unless \`state\` exactly matches the value generated for this attempt.

## Exchange the authorization

Exchange the one-time code and original verifier as JSON:

\`\`\`http
POST ${site}/api/cli/token
Content-Type: application/json

{
  "authorizationId": "<authorization_id>",
  "code": "<one-time-code>",
  "codeVerifier": "<original-code-verifier>"
}
\`\`\`

A successful response contains \`token\`, \`tokenType: "Bearer"\`, \`scopes\`, and \`expiresAt\`. The exchange code is single use. Hub access tokens expire after 180 days unless revoked earlier.

## Use and protect the credential

Send the token only to this Hub origin:

\`\`\`http
Authorization: Bearer <token>
\`\`\`

Keep the credential outside prompts, logs, source control, URLs, and generated content. The official CLI stores it in the operating system keychain. On HTTP 401, discard the credential and start a fresh registration flow.

## Inspect and revoke

- \`GET ${site}/api/cli/token\` with the Bearer header returns the current user, token scopes, and expiry.
- \`DELETE ${site}/api/cli/token\` with the Bearer header revokes the current token and returns HTTP 204.

## API references

- OpenAPI: ${site}/openapi.json
- API documentation: ${site}/api-docs.md
- Operations contract: https://github.com/liyown/dshx/blob/main/apps/framework-hub/OPERATIONS.md
`;
}

function bodyFingerprint(body: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(body)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function authDiscoveryHeaders(
  kind: "markdown" | "protected-resource" | "authorization-server",
  body: string,
): Headers {
  return new Headers({
    "cache-control": "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400",
    "content-length": String(new TextEncoder().encode(body).byteLength),
    "content-type": kind === "markdown" ? "text/markdown; charset=utf-8" : "application/json",
    etag: `"dshx-auth-${kind}-${bodyFingerprint(body)}"`,
  });
}
