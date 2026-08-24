import type { AppBindings } from "@/lib/db/context";

const repositoryApiUrl = "https://api.github.com/repos/liyown/dshx";

type FetchGitHub = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function fetchGitHubStarCount(
  bindings: AppBindings,
  fetchGitHub: FetchGitHub = fetch,
): Promise<number | null> {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "dshx-framework-hub",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  if (bindings.GITHUB_TOKEN) headers.set("Authorization", `Bearer ${bindings.GITHUB_TOKEN}`);

  try {
    const response = await fetchGitHub(repositoryApiUrl, { headers });
    if (!response.ok) return null;

    const result = (await response.json()) as { stargazers_count?: unknown };
    return typeof result.stargazers_count === "number" &&
      Number.isInteger(result.stargazers_count) &&
      result.stargazers_count >= 0
      ? result.stargazers_count
      : null;
  } catch {
    return null;
  }
}
