import { createFileRoute } from "@tanstack/react-router";

import {
  AGENT_PROMPT_BOOTSTRAP,
  AGENT_PROMPT_MARKDOWN,
  AGENT_PROMPT_META,
} from "@/lib/agent-prompt.server";
import { loadAgentResources } from "@/lib/agent-resources.server";
import { requireAdminApiToken } from "@/lib/auth/tokens.server";
import {
  operationFailure,
  operationRequestId,
  operationSuccess,
} from "@/lib/catalog/operations-v1.http";
import { requireDatabase } from "@/lib/db/client";

export const Route = createFileRoute("/api/ops/v1/agent-bundle")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const requestId = operationRequestId(request);
        try {
          const db = requireDatabase(context);
          await requireAdminApiToken(db, request);
          const resources = await loadAgentResources(db, context);
          const response = operationSuccess(
            request,
            {
              bootstrap: AGENT_PROMPT_BOOTSTRAP,
              prompt: AGENT_PROMPT_MARKDOWN,
              resources,
              meta: {
                promptVersion: AGENT_PROMPT_META.promptVersion,
                cliVersion: AGENT_PROMPT_META.cliVersion,
                cliChannel: AGENT_PROMPT_META.cliChannel,
                capabilitiesHash: AGENT_PROMPT_META.capabilitiesHash,
                contentSha256: AGENT_PROMPT_META.contentSha256,
                sourceUrl: AGENT_PROMPT_META.sourceUrl,
                npxCommand: AGENT_PROMPT_META.npxCommand,
              },
            },
            { requestId },
          );
          response.headers.set("cache-control", "no-store");
          response.headers.set("x-robots-tag", "noindex");
          return response;
        } catch (error) {
          const response = operationFailure(request, error, requestId);
          response.headers.set("cache-control", "no-store");
          response.headers.set("x-robots-tag", "noindex");
          return response;
        }
      },
    },
  },
});
