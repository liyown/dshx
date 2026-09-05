import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { capabilities, readCliPackage } from "../src/capabilities.js";
import { commandShapes } from "../src/command-registry.js";
import {
  curationContentSchema,
  operationReportInputSchema,
} from "../src/contracts.js";

afterEach(() => vi.unstubAllGlobals());

describe("embedded CLI capabilities", () => {
  it("reads the executing package and enumerates the parser's registered commands offline", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const document = await capabilities();
    const metadata = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { name: string; version: string };
    expect(document.package).toEqual({
      name: metadata.name,
      version: metadata.version,
    });
    expect(await readCliPackage()).toEqual(document.package);
    expect(document.apiProtocolVersion).toBe(1);
    expect(document.dailyPromptVersion).toBe(7);
    expect(document.commands.map((entry) => entry.command)).toEqual(
      Object.keys(commandShapes),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("publishes the exact bilingual curation shape from the runtime validator", async () => {
    const document = await capabilities();
    const command = document.commands.find(
      (entry) => entry.command === "plugin curate",
    );
    expect(command?.input?.schema).toEqual(
      z.toJSONSchema(curationContentSchema, { io: "input" }),
    );
    expect(command?.input?.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: [
        "displayName",
        "shortDescription",
        "overviewMarkdown",
        "categories",
        "tags",
        "derivedFrom",
      ],
      properties: {
        displayName: {
          type: "object",
          required: ["zh", "en"],
          additionalProperties: false,
        },
      },
    });
    const report = document.commands.find(
      (entry) => entry.command === "report publish",
    );
    expect(report?.input?.schema).toEqual(
      z.toJSONSchema(operationReportInputSchema, { io: "input" }),
    );
    expect(report?.input?.schema.required).not.toContain("schemaVersion");
  });

  it("exposes all commands accepting JSON files and the additional runtime refinements", async () => {
    const document = await capabilities();
    for (const command of document.commands) {
      if (command.options.includes("input")) {
        expect(command.input, command.command).toBeDefined();
        expect(command.input?.option).toBe("input");
      }
    }
    expect(document.inputValidation).toContain("Cross-field refinements");
  });
});
