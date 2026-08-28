import { QueryClient } from "@tanstack/react-query";

import { shouldRetryApiRequest } from "./api-client";

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryApiRequest,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
