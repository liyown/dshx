import { describe, expect, it, vi } from "vitest";

import { fetchGitHubStarCount } from "./stars.server";

describe("fetchGitHubStarCount", () => {
  it("uses a server-side token and returns the public star count", async () => {
    const fetchGitHub = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer github-token");
      expect(headers.get("user-agent")).toBe("dshx-framework-hub");
      return Response.json({ stargazers_count: 42 });
    });

    await expect(fetchGitHubStarCount({ GITHUB_TOKEN: "github-token" }, fetchGitHub)).resolves.toBe(
      42,
    );
    expect(fetchGitHub).toHaveBeenCalledOnce();
  });

  it("supports public reads without exposing an authorization header", async () => {
    const fetchGitHub = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return Response.json({ stargazers_count: 7 });
    });

    await expect(fetchGitHubStarCount({}, fetchGitHub)).resolves.toBe(7);
  });

  it("degrades to an unavailable count when GitHub rejects or changes the response", async () => {
    await expect(
      fetchGitHubStarCount(
        {},
        vi.fn(async () => Response.json({ message: "rate limited" }, { status: 403 })),
      ),
    ).resolves.toBeNull();
    await expect(
      fetchGitHubStarCount(
        {},
        vi.fn(async () => Response.json({ stargazers_count: "42" })),
      ),
    ).resolves.toBeNull();
    await expect(
      fetchGitHubStarCount(
        {},
        vi.fn(async () => {
          throw new TypeError("network unavailable");
        }),
      ),
    ).resolves.toBeNull();
  });
});
