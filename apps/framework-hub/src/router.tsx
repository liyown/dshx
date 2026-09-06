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
    defaultPreloadStaleTime: 0,
    defaultViewTransition: prefersReducedMotion() ? false : navigationViewTransition,
  });

  return router;
};
