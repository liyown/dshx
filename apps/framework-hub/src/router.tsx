import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { createAppQueryClient } from "./lib/query-client";
import { navigationViewTransition, prefersReducedMotion } from "./lib/navigation-motion";

export const getRouter = () => {
  const queryClient = createAppQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Catalog loaders are edge-cached for a minute; reusing them briefly on the
    // client keeps in-app navigation from re-requesting the same page.
    defaultPreload: "intent",
    defaultPreloadDelay: 120,
    defaultPreloadStaleTime: 30_000,
    defaultStaleTime: 30_000,
    defaultViewTransition: prefersReducedMotion() ? false : navigationViewTransition,
  });

  return router;
};
