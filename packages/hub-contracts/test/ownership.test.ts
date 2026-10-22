import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cliSource = fileURLToPath(new URL("../../framework-hub-cli/src", import.meta.url));

async function sourceFiles(directory = cliSource): Promise<Array<{ path: string; text: string }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filePath = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(filePath);
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
      return [{ path: relative(cliSource, filePath), text: await readFile(filePath, "utf8") }];
    }),
  );
  return nested.flat();
}

function violating(predicate: (text: string) => boolean): Promise<string[]> {
  return sourceFiles().then((files) =>
    files.filter(({ text }) => predicate(text)).map(({ path }) => path),
  );
}

/**
 * The CLI produces observations; it does not define them.
 *
 * Before this package existed the CLI carried a hand-written copy of the
 * payload schema. The copies drifted in four ways — npm package casing, the
 * GitHub full name shape, whether a subdirectory defaults to the repository
 * root, and how many primary install targets an observation may declare — and
 * every one of them surfaced as a 422 after a successful local run. These
 * assertions are what keeps the copy from coming back.
 */
describe("the CLI is an adapter over this contract", () => {
  it("declares no second copy of the payload shape", async () => {
    expect(
      await violating((text) => /export const (?:plugin)?[Oo]bservation\w*Schema\s*=/u.test(text)),
    ).toEqual([]);
  });

  it("declares no second canonical serializer", async () => {
    expect(
      await violating((text) =>
        /function (?:canonicalize|canonicalJson|stableJson)\s*\(/u.test(text),
      ),
    ).toEqual([]);
  });

  it("derives observation ids from the contract's input, not its own", async () => {
    expect(await violating((text) => /etag\s*\?\?\s*source\.contentHash/u.test(text))).toEqual([]);
  });
});
