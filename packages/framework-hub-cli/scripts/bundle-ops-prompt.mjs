import { writeFile } from "node:fs/promises";

import {
  dailyOperationsCommandContract,
  dailyOperationsPolicy,
  dailyOperationsPromptVersion,
  loadDailyOperationsPrompt,
} from "../../hub-ops-prompt/dist/index.js";
import { DAILY_PROMPT_VERSION, capabilities } from "../dist/capabilities.js";

if (dailyOperationsPromptVersion !== DAILY_PROMPT_VERSION)
  throw new Error("CLI and bundled operations prompt versions differ.");

const surface = await capabilities();
const commandNames = new Set(surface.commands.map((entry) => entry.command));
for (const entry of dailyOperationsCommandContract) {
  if (!commandNames.has(entry.command))
    throw new Error(
      `Bundled prompt names an unavailable command: ${entry.command}`,
    );
}

await writeFile(
  new URL("../dist/ops-prompt.json", import.meta.url),
  `${JSON.stringify(
    {
      promptVersion: dailyOperationsPromptVersion,
      commands: dailyOperationsCommandContract,
      policy: dailyOperationsPolicy,
      prompt: loadDailyOperationsPrompt(),
    },
    null,
    2,
  )}\n`,
);
