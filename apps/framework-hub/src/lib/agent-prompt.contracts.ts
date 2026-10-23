import { z } from "zod";

/**
 * The operator prompt page's contracts. The page renders `/api/admin/agent-prompt`
 * and, after saving one resource, the same resources again; both answers carry
 * the resource list, so the page parses both with `resourcesSchema`.
 */

export const agentResourceStatusSchema = z.object({
  key: z.string(),
  env: z.string(),
  label: z.string(),
  description: z.string(),
  configured: z.boolean(),
  updatedAt: z.string().nullable(),
});

export const agentPromptSchema = z.object({
  bootstrap: z.string(),
  prompt: z.string(),
  meta: z.object({
    promptVersion: z.number(),
    cliVersion: z.string(),
    cliChannel: z.string(),
    capabilitiesHash: z.string(),
    contentSha256: z.string(),
    sourceUrl: z.string(),
    npxCommand: z.string(),
  }),
  resources: z.array(agentResourceStatusSchema),
});

/** `PUT /api/admin/agent-prompt/resources` answers with the new resource list. */
export const agentResourcesSchema = z.object({ resources: z.array(agentResourceStatusSchema) });

export const agentResourceWriteSchema = z
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

export type AgentResourceStatus = z.infer<typeof agentResourceStatusSchema>;
export type AgentPrompt = z.infer<typeof agentPromptSchema>;
export type AgentResourceWrite = z.infer<typeof agentResourceWriteSchema>;
