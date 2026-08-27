import { describe, expect, it } from "vitest";

import { CliError } from "../src/errors.js";
import {
  discoverSources,
  inspectSource,
  parseSourceTarget,
} from "../src/source.js";

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json", ...init.headers },
    ...init,
  });
}

function githubFixture() {
  const blobs: Record<string, string> = {
    root: JSON.stringify({ private: true, workspaces: ["packages/*"] }),
    rootReadme: "This repository contains DSH experiments.",
    plain: JSON.stringify({
      name: "ordinary-plugin",
      version: "1.0.0",
      dsh: { bundle: { patch: "dist/plugin.patch.json" } },
    }),
    dshx: JSON.stringify({
      name: "@fixture/dshx-plugin",
      version: "2.0.0",
      dsh: { bundle: { patch: "plugin.patch.json" } },
    }),
    weak: JSON.stringify({ name: "utility", version: "3.0.0" }),
    weakReadme: "Integrates with DeepSeek Harness.",
    quiet: JSON.stringify({ name: "quiet-utility", version: "1.0.0" }),
  };
  const tree = [
    { path: "package.json", type: "blob", sha: "root" },
    { path: "README.md", type: "blob", sha: "rootReadme" },
    { path: "packages/plain/package.json", type: "blob", sha: "plain" },
    { path: "packages/dshx/package.json", type: "blob", sha: "dshx" },
    { path: "packages/weak/package.json", type: "blob", sha: "weak" },
    { path: "packages/weak/README.md", type: "blob", sha: "weakReadme" },
    { path: "packages/quiet/package.json", type: "blob", sha: "quiet" },
    {
      path: "packages/oversized/package.json",
      type: "blob",
      sha: "oversized",
      size: 1_000_001,
    },
  ];
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url.toString());
    if (url.pathname === "/repos/fixture/repository")
      return json({
        id: 42,
        full_name: "fixture/repository",
        default_branch: "main",
        topics: [],
        description: "x".repeat(2_001),
        homepage: "javascript:alert(1)",
        archived: true,
        disabled: false,
        stargazers_count: 12,
        owner: {
          id: 7,
          login: "fixture",
          type: "Organization",
          avatar_url: "https://avatars.githubusercontent.com/u/7?v=4",
          html_url: "https://github.com/fixture",
        },
      });
    if (url.pathname === "/repos/fixture/repository/git/trees/main")
      return json({ sha: "tree-sha", truncated: false, tree });
    const blobSha = url.pathname.match(/\/git\/blobs\/([^/]+)$/)?.[1];
    if (blobSha && blobs[blobSha])
      return json({
        encoding: "base64",
        content: Buffer.from(blobs[blobSha]).toString("base64"),
      });
    return json({ message: "not found" }, { status: 404 });
  };
  return { fetcher, requests };
}

describe("public source collectors", () => {
  it("parses only supported GitHub and npm identifiers and canonical URLs", () => {
    expect(parseSourceTarget("github:owner/repository")).toEqual({
      kind: "github",
      owner: "owner",
      repository: "repository",
    });
    expect(parseSourceTarget("npm:@scope/plugin")).toEqual({
      kind: "npm",
      packageName: "@scope/plugin",
    });
    expect(
      parseSourceTarget("https://www.npmjs.com/package/@scope/plugin"),
    ).toEqual({
      kind: "npm",
      packageName: "@scope/plugin",
    });
    expect(() =>
      parseSourceTarget("http://github.com/owner/repository"),
    ).toThrow("Only HTTPS");
    expect(() => parseSourceTarget("https://github.com/owner/%zz")).toThrow(
      "invalid percent encoding",
    );
  });

  it("discovers multiple workspace packages and applies strong and weak signals correctly", async () => {
    const fixture = githubFixture();
    const result = await inspectSource("github:fixture/repository", {
      fetch: fixture.fetcher,
      now: () => new Date("2026-08-27T00:00:00.000Z"),
    });
    expect(result.data.observations).toHaveLength(4);
    const ordinary = result.data.observations.find(
      (item) => item.facts?.package?.name === "ordinary-plugin",
    );
    const dshx = result.data.observations.find(
      (item) => item.facts?.package?.name === "@fixture/dshx-plugin",
    );
    const weak = result.data.observations.find(
      (item) => item.facts?.package?.name === "utility",
    );
    expect(ordinary?.detection?.signals).toContainEqual(
      expect.objectContaining({ kind: "dsh.bundle.patch" }),
    );
    expect(ordinary?.facts?.compatibility).toBeUndefined();
    expect(dshx?.detection?.signals).toContainEqual(
      expect.objectContaining({ kind: "dsh.bundle.patch" }),
    );
    expect(weak?.detection).toEqual({
      signals: [{ kind: "readme", value: "DSH" }],
    });
    expect(
      result.data.observations.some(
        (item) =>
          item.identity.kind === "github" &&
          item.identity.subdirectory === "packages/quiet",
      ),
    ).toBe(false);
    expect(ordinary?.facts?.installTargets?.[0]?.available).toBe(true);
    expect(ordinary?.facts?.installTargets?.[1]).toMatchObject({
      kind: "npm",
      primary: false,
      available: false,
    });
    expect(ordinary?.facts?.publisher).toEqual({
      githubId: "7",
      login: "fixture",
      kind: "organization",
      avatarUrl: "https://avatars.githubusercontent.com/u/7?v=4",
      profileUrl: "https://github.com/fixture",
    });
    expect(ordinary?.facts?.readme).toMatchObject({
      availability: "available",
      format: "markdown",
      sourceRef: "main",
      path: "README.md",
      content: "This repository contains DSH experiments.",
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "repository-archived" }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "source-file-too-large",
        path: "packages/oversized/package.json",
      }),
    );
    expect(
      result.warnings.filter(
        (warning) => warning.code === "remote-field-dropped",
      ),
    ).toHaveLength(2);
    expect(fixture.requests.join("\n")).not.toContain("/git/blobs/oversized");
    expect(fixture.requests.join("\n")).not.toMatch(
      /tarball|npm install|clone/i,
    );
  });

  it("collects npm metadata without installing or executing the package", async () => {
    const requests: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      requests.push(url);
      return json(
        {
          "dist-tags": { latest: "1.2.3" },
          versions: {
            "1.2.3": {
              name: "plain-dsh-plugin",
              version: "1.2.3",
              deprecated: "Use the replacement",
              scripts: { postinstall: "exit 99" },
              dsh: { bundle: { patch: "plugin.patch.json" } },
            },
          },
          readme: "# Plain DSH plugin\n\nPublishes sourced events.",
          time: { "1.2.3": "2026-08-26T00:00:00.000Z" },
        },
        { headers: { etag: '"registry-etag"' } },
      );
    };
    const result = await inspectSource("npm:plain-dsh-plugin", {
      fetch: fetcher,
      now: () => new Date("2026-08-27T00:00:00.000Z"),
    });
    expect(result.data.observations[0]).toMatchObject({
      identity: { kind: "npm", packageName: "plain-dsh-plugin" },
      detection: {
        signals: expect.arrayContaining([
          expect.objectContaining({ kind: "dsh.bundle.patch" }),
        ]),
      },
      facts: { installTargets: [{ available: true }] },
    });
    expect(result.data.observations[0]?.facts?.readme).toMatchObject({
      availability: "available",
      format: "markdown",
      sourceRef: "1.2.3",
      content: "# Plain DSH plugin\n\nPublishes sourced events.",
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "package-deprecated" }),
    );
    expect(requests).toEqual(["https://registry.npmjs.org/plain-dsh-plugin"]);
  });

  it("emits an explicitly inspected npm package even without discovery signals", async () => {
    const fetcher: typeof fetch = async () =>
      json({
        "dist-tags": { latest: "1.0.0" },
        versions: {
          "1.0.0": { name: "plain-package", version: "1.0.0" },
        },
      });
    const result = await inspectSource("npm:plain-package", { fetch: fetcher });
    expect(result.data.observations[0]?.detection).toEqual({
      signals: [],
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "no-plugin-signals" }),
    );
  });

  it("caps monorepo discovery at 100 package manifests", async () => {
    const tree = [
      { path: "package.json", type: "blob", sha: "root", size: 200 },
      ...Array.from({ length: 100 }, (_, index) => ({
        path: `packages/plugin-${String(index).padStart(3, "0")}/package.json`,
        type: "blob",
        sha: `plugin-${String(index).padStart(3, "0")}`,
        size: 200,
      })),
    ];
    const requestedBlobs: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/repos/fixture/large")
        return json({
          id: 99,
          full_name: "fixture/large",
          default_branch: "main",
          topics: [],
        });
      if (url.pathname === "/repos/fixture/large/git/trees/main")
        return json({ sha: "tree-sha", truncated: false, tree });
      const sha = url.pathname.match(/\/git\/blobs\/([^/]+)$/)?.[1];
      if (sha) {
        requestedBlobs.push(sha);
        const manifest =
          sha === "root"
            ? {
                name: "root-plugin",
                version: "1.0.0",
                workspaces: ["packages/*"],
                dsh: { bundle: { patch: "plugin.patch.json" } },
              }
            : {
                name: sha,
                version: "1.0.0",
                dsh: { bundle: { patch: "plugin.patch.json" } },
              };
        return json({
          encoding: "base64",
          content: Buffer.from(JSON.stringify(manifest)).toString("base64"),
        });
      }
      return json({ message: "not found" }, { status: 404 });
    };
    const result = await inspectSource("github:fixture/large", {
      fetch: fetcher,
    });
    expect(result.data.truncated).toBe(true);
    expect(result.data.observations).toHaveLength(100);
    expect(requestedBlobs).not.toContain("plugin-099");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "workspace-truncated" }),
    );
  });

  it("normalizes GitHub rate limits as retryable operation errors", async () => {
    const fetcher: typeof fetch = async () =>
      json(
        { message: "You have exceeded a secondary rate limit." },
        {
          status: 403,
          headers: { "x-ratelimit-remaining": "10", "retry-after": "60" },
        },
      );
    const error = await inspectSource("github:fixture/repository", {
      fetch: fetcher,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).issue).toMatchObject({
      code: "github_rate_limited",
      retryable: true,
    });
  });

  it("refuses to turn private GitHub repository data into a Hub observation", async () => {
    const fetcher: typeof fetch = async () =>
      json({
        id: 42,
        full_name: "fixture/private-repository",
        default_branch: "main",
        private: true,
      });
    const error = await inspectSource("github:fixture/private-repository", {
      fetch: fetcher,
      githubToken: "rate-limit-token",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).issue).toMatchObject({
      code: "source_not_public",
      retryable: false,
    });
  });

  it("discovers, deduplicates, and paginates public GitHub repository metadata", async () => {
    const requests: URL[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      return json({
        total_count: 3,
        items:
          url.searchParams.get("page") === "1"
            ? [
                {
                  id: 101,
                  full_name: "Example/Plugin",
                  updated_at: "2026-08-26T12:00:00.000Z",
                },
                {
                  id: 101,
                  full_name: "Example/Plugin",
                  pushed_at: "2026-08-26T11:00:00.000Z",
                },
              ]
            : [
                {
                  full_name: "Example/Second",
                  updated_at: "2026-08-25T10:00:00.000Z",
                },
              ],
      });
    };
    const first = await discoverSources({
      provider: "github",
      query: '"dsh.bundle.patch"',
      since: "2026-08-24",
      limit: 2,
      fetch: fetcher,
      githubToken: "read-only-token",
    });
    expect(first.data.candidates).toEqual([
      {
        provider: "github",
        canonical: "github:id:101",
        url: "https://github.com/Example/Plugin",
        updatedAt: "2026-08-26T12:00:00.000Z",
        matchedQuery: '"dsh.bundle.patch"',
        repositoryId: "101",
      },
    ]);
    expect(first.data.nextCursor).toEqual(expect.any(String));
    const second = await discoverSources({
      provider: "github",
      query: '"dsh.bundle.patch"',
      since: "2026-08-24",
      cursor: first.data.nextCursor!,
      limit: 2,
      fetch: fetcher,
    });
    expect(second.data.candidates[0]?.canonical).toBe("github:example/second");
    expect(second.data.candidates[0]?.repositoryId).toBeUndefined();
    expect(second.data.nextCursor).toBeNull();
    expect(requests[0]?.searchParams.get("q")).toContain("pushed:>=2026-08-24");
    expect(requests.map((url) => url.origin + url.pathname)).toEqual([
      "https://api.github.com/search/repositories",
      "https://api.github.com/search/repositories",
    ]);
  });

  it("filters npm discovery by the requested time window without fetching package code", async () => {
    const requests: URL[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      return json({
        total: 3,
        objects: [
          {
            package: {
              name: "@scope/plugin",
              date: "2026-08-26T00:00:00.000Z",
            },
          },
          {
            package: {
              name: "@scope/plugin",
              date: "2026-08-25T00:00:00.000Z",
            },
          },
          { package: { name: "old-plugin", date: "2026-07-01T00:00:00.000Z" } },
        ],
      });
    };
    const result = await discoverSources({
      provider: "npm",
      query: "deepseek-harness plugin",
      since: "2026-08-24T00:00:00.000Z",
      limit: 10,
      fetch: fetcher,
    });
    expect(result.data.candidates).toHaveLength(1);
    expect(result.data.candidates[0]).toMatchObject({
      canonical: "npm:@scope/plugin",
      url: "https://www.npmjs.com/package/@scope/plugin",
    });
    expect(requests.map((url) => url.origin + url.pathname)).toEqual([
      "https://registry.npmjs.org/-/v1/search",
    ]);
  });

  it("normalizes discovery rate limits and rejects cursors from another query", async () => {
    const limited: typeof fetch = async () =>
      json(
        { message: "rate limited" },
        { status: 429, headers: { "retry-after": "30" } },
      );
    const error = await discoverSources({
      provider: "npm",
      query: "dsh plugin",
      since: "2026-08-24",
      fetch: limited,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).issue).toMatchObject({
      code: "npm_rate_limited",
      retryable: true,
      details: { retryAfter: "30" },
    });
    const foreignCursor = Buffer.from(
      JSON.stringify({ provider: "github", query: "other", offset: 10 }),
    ).toString("base64url");
    await expect(
      discoverSources({
        provider: "github",
        query: "dsh plugin",
        since: "2026-08-24",
        cursor: foreignCursor,
        fetch: limited,
      }),
    ).rejects.toMatchObject({
      issue: { code: "invalid_cursor", retryable: false },
    });
  });
});
