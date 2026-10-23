import { createFileRoute } from "@tanstack/react-router";

import {
  AGENT_PROMPT_BOOTSTRAP,
  AGENT_PROMPT_MARKDOWN,
  AGENT_PROMPT_META,
} from "@/lib/agent-prompt.server";
import { loadAgentResources } from "@/lib/agent-resources.server";
import { v1PluginOperations } from "@/lib/api/operations/v1-plugins";

export const Route = createFileRoute("/api/ops/v1/agent-bundle")({
  server: {
    handlers: {
      GET: v1PluginOperations.getAgentBundle.route(async ({ db, context }) => ({
        bootstrap: AGENT_PROMPT_BOOTSTRAP,
        prompt: AGENT_PROMPT_MARKDOWN,
        resources: await loadAgentResources(db, context),
        meta: {
          promptVersion: AGENT_PROMPT_META.promptVersion,
          cliVersion: AGENT_PROMPT_META.cliVersion,
          cliChannel: AGENT_PROMPT_META.cliChannel,
          capabilitiesHash: AGENT_PROMPT_META.capabilitiesHash,
          contentSha256: AGENT_PROMPT_META.contentSha256,
          sourceUrl: AGENT_PROMPT_META.sourceUrl,
          npxCommand: AGENT_PROMPT_META.npxCommand,
        },
      })),
    },
  },
});
