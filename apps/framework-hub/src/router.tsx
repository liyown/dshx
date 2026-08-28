import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { createAppQueryClient } from "./lib/query-client";

export const getRouter = () => {
  const queryClient = createAppQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
