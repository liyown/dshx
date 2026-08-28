import { createFileRoute } from "@tanstack/react-router";

import { serveMcp } from "@/lib/mcp-server";

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      GET: ({ request, context }) => serveMcp(request, context),
      HEAD: ({ request, context }) => serveMcp(request, context),
      POST: ({ request, context }) => serveMcp(request, context),
      OPTIONS: ({ request, context }) => serveMcp(request, context),
    },
  },
});
