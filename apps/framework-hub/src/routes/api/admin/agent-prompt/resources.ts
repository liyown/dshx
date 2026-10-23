import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  clearAgentResource,
  listAgentResourceStatus,
  saveAgentResource,
} from "@/lib/agent-resources.server";
import { adminRoute } from "@/lib/api/route";

const noStore = { "cache-control": "no-store" };

const resourceInput = z
  .object({
    key: z.string().min(1).max(64),
    value: z.string().max(4096).optional(),
    clear: z.boolean().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.clear === true && input.value !== undefined)
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Do not send a value when clearing a resource",
      });
    if (input.clear !== true && (input.value === undefined || input.value === ""))
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "A resource value is required",
      });
  });

export const Route = createFileRoute("/api/admin/agent-prompt/resources")({
  server: {
    handlers: {
      PUT: adminRoute(
        { body: resourceInput, headers: noStore },
        async ({ context, db, session, input }) => {
          if (input.clear === true) await clearAgentResource(db, input.key);
          else await saveAgentResource(db, context, input.key, input.value ?? "", session.user.id);
          return { resources: await listAgentResourceStatus(db) };
        },
      ),
    },
  },
});
