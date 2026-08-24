import { createFileRoute } from "@tanstack/react-router";

import { createAuth } from "@/lib/auth/auth.server";
import { jsonError } from "@/lib/http";

async function handle(request: Request, context: unknown) {
  try {
    return await createAuth(context).handler(request);
  } catch (error) {
    return jsonError(error);
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request, context }) => handle(request, context),
      POST: ({ request, context }) => handle(request, context),
    },
  },
});
