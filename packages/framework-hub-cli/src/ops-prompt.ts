import { readFile } from "node:fs/promises";

import { DAILY_PROMPT_VERSION } from "./capabilities.js";
import { CliError } from "./errors.js";

/** The prompt is shipped in the same tarball as its executable command surface. */
export async function readOperationsPrompt(): Promise<unknown> {
  try {
    const bundle = JSON.parse(
      await readFile(
        new URL("../dist/ops-prompt.json", import.meta.url),
        "utf8",
      ),
    ) as { promptVersion?: number; prompt?: string };
    if (bundle.promptVersion !== DAILY_PROMPT_VERSION || !bundle.prompt)
      throw new Error("Prompt version does not match this CLI.");
    return bundle;
  } catch {
    throw new CliError({
      code: "ops_prompt_unavailable",
      message: "The bundled operations prompt is missing or incompatible.",
      retryable: false,
      repairHint:
        "Repair this CLI installation. Do not search other checkouts or reconstruct a prompt from source.",
    });
  }
}
