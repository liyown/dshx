import { createFileRoute } from "@tanstack/react-router";

import { agentResourcesSchema, agentResourceWriteSchema } from "@/lib/agent-prompt.contracts";
import {
  clearAgentResource,
  listAgentResourceStatus,
  saveAgentResource,
} from "@/lib/agent-resources.server";
import { adminRoute } from "@/lib/api/route";

const noStore = { "cache-control": "no-store" };

export const Route = createFileRoute("/api/admin/agent-prompt/resources")({
  server: {
    handlers: {
      PUT: adminRoute(
        { body: agentResourceWriteSchema, headers: noStore, response: agentResourcesSchema },
        async ({ context, db, session, input }) => {
          if (input.clear === true) await clearAgentResource(db, input.key);
          else await saveAgentResource(db, context, input.key, input.value ?? "", session.user.id);
          return { resources: await listAgentResourceStatus(db) };
        },
      ),
    },
  },
});
