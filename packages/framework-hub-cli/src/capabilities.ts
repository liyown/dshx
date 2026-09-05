import { readFile } from "node:fs/promises";

import { z } from "zod";

import { commandShapes } from "./command-registry.js";
import {
  curationContentSchema,
  mediaInputSchema,
  operationReportInputSchema,
  pluginObservationBaseSchema,
} from "./contracts.js";
import { CliError } from "./errors.js";
import { opsCheckpointSchema } from "./ops-state.js";

export const cliPackageName = "@becomeopc/dshx-hub-cli";
export const apiProtocolVersion = 1 as const;
export const DAILY_PROMPT_VERSION = 7 as const;

export type CliPackage = { name: string; version: string };

/** Resolve metadata from the executing package, never from cwd or a checkout. */
export async function readCliPackage(): Promise<CliPackage> {
  let metadata: unknown;
  try {
    metadata = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
  } catch {
    throw new CliError({
      code: "cli_package_invalid",
      message: "The executing CLI package metadata cannot be read.",
      retryable: false,
      repairHint: "Reinstall the configured CLI version and retry preflight.",
    });
  }
  const parsed = z
    .object({
      name: z.literal(cliPackageName),
      version: z
        .string()
        .regex(/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/),
    })
    .safeParse(metadata);
  if (!parsed.success)
    throw new CliError({
      code: "cli_package_invalid",
      message: "The executing package is not a versioned DSHX Hub CLI.",
      retryable: false,
      repairHint: "Reinstall the configured CLI package and retry preflight.",
    });
  return parsed.data;
}

const inputContracts = {
  "ops checkpoint": {
    schema: opsCheckpointSchema,
    description:
      "Identifiers and the completed stage for one item. Store a checkpoint after each completed action.",
  },
  "plugin upsert": {
    schema: pluginObservationBaseSchema,
    description:
      "One PluginObservationV1. Arrays, { observations: [...] }, and a successful source inspect envelope are also accepted. Omit observationId to let the CLI derive it.",
  },
  "plugin curate": {
    schema: curationContentSchema,
    description:
      "The complete bilingual curation document. Pass it directly, without a content wrapper.",
  },
  "report publish": {
    schema: operationReportInputSchema,
    description: "The operation report document for one run.",
  },
  "media upload": {
    schema: mediaInputSchema,
    description: "Metadata and localPath for one image upload.",
  },
} as const;

export async function capabilities() {
  const cliPackage = await readCliPackage();
  return {
    schemaVersion: 1 as const,
    package: cliPackage,
    dailyPromptVersion: DAILY_PROMPT_VERSION,
    apiProtocolVersion,
    apiBasePath: `/api/ops/v${apiProtocolVersion}`,
    globalOptions: ["help", "version"],
    commands: Object.entries(commandShapes).map(([command, shape]) => {
      const input = inputContracts[command as keyof typeof inputContracts];
      return {
        command,
        positionalCount: shape.arity,
        options: [...shape.options],
        ...(input
          ? {
              input: {
                option: "input",
                description: input.description,
                schema: z.toJSONSchema(input.schema, { io: "input" }),
              },
            }
          : {}),
      };
    }),
    inputValidation:
      "JSON Schemas are generated from the CLI's runtime Zod schemas. Cross-field refinements, canonical observation identifiers, and media file checks are additionally enforced by the command.",
  };
}

export type Capabilities = Awaited<ReturnType<typeof capabilities>>;
