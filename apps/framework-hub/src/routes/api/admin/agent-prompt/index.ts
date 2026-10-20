import { createFileRoute } from "@tanstack/react-router";

import {
  AGENT_PROMPT_BOOTSTRAP,
  AGENT_PROMPT_MARKDOWN,
  AGENT_PROMPT_META,
} from "@/lib/agent-prompt.server";
import { listAgentResourceStatus } from "@/lib/agent-resources.server";
import { requireAdminSession } from "@/lib/auth/auth.server";
import { jsonError } from "@/lib/http";

export const Route = createFileRoute("/api/admin/agent-prompt/")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        try {
          const { db } = await requireAdminSession(request, context);
          return Response.json(
            {
              bootstrap: AGENT_PROMPT_BOOTSTRAP,
              prompt: AGENT_PROMPT_MARKDOWN,
              meta: AGENT_PROMPT_META,
              resources: await listAgentResourceStatus(db),
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return jsonError(error);
        }
      },
    },
  },
});
