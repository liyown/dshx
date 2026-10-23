import { createFileRoute } from "@tanstack/react-router";

import {
  AGENT_PROMPT_BOOTSTRAP,
  AGENT_PROMPT_MARKDOWN,
  AGENT_PROMPT_META,
} from "@/lib/agent-prompt.server";
import { agentPromptSchema } from "@/lib/agent-prompt.contracts";
import { listAgentResourceStatus } from "@/lib/agent-resources.server";
import { adminRoute } from "@/lib/api/route";

const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/admin/agent-prompt/")({
  server: {
    handlers: {
      GET: adminRoute({ headers: noStore, response: agentPromptSchema }, async ({ db }) => ({
        bootstrap: AGENT_PROMPT_BOOTSTRAP,
        prompt: AGENT_PROMPT_MARKDOWN,
        meta: AGENT_PROMPT_META,
        resources: await listAgentResourceStatus(db),
      })),
    },
  },
});
