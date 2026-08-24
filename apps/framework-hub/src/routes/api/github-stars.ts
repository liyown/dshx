import { createFileRoute } from "@tanstack/react-router";

import { requireBindings } from "@/lib/db/context";
import { fetchGitHubStarCount } from "@/lib/github/stars.server";

const availableCacheControl = "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400";
const unavailableCacheControl = "public, max-age=60, s-maxage=300";

function defaultCache(): Cache | undefined {
  if (typeof caches === "undefined") return undefined;
  return (caches as CacheStorage & { default?: Cache }).default;
}

export const Route = createFileRoute("/api/github-stars")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const cache = defaultCache();
        const cacheKey = new Request(request.url, { method: "GET" });
        const cached = await cache?.match(cacheKey);
        if (cached) return cached;

        const count = await fetchGitHubStarCount(requireBindings(context));
        const response = Response.json(
          { count },
          {
            headers: {
              "cache-control": count === null ? unavailableCacheControl : availableCacheControl,
            },
          },
        );
        await cache?.put(cacheKey, response.clone());
        return response;
      },
    },
  },
});
