/**
 * A local D1 database that belongs to one test file.
 *
 * Every integration suite boots its own Miniflare, and Miniflare's D1 is a
 * SQLite file under the persist root. They used to share `.wrangler/state`,
 * so two suites running at once wrote to the same file — which is the reason
 * the whole run carried `--no-file-parallelism`.
 *
 * Each suite now starts from a copy of a template that holds nothing but the
 * migrations, so suites can run together without sharing a file. The template
 * is built once by `pnpm db:migrate:test`; see `.wrangler/test-template`.
 *
 * `getPlatformProxy`'s `persist.path` is the v3 root, not a `--persist-to`
 * root, so a suite directory is copied from the template's `v3` directory and
 * handed over as-is.
 */

import { cp, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";

import { createDatabase, type Database } from "@/lib/db/client";

const appRoot = fileURLToPath(new URL("../..", import.meta.url));
const templateRoot = join(appRoot, ".wrangler/test-template/v3");
const suitesRoot = join(appRoot, ".wrangler/test-state");

/** What `getPlatformProxy` returns, named so suites can type their own handle. */
export type LocalD1Proxy = Awaited<ReturnType<typeof getPlatformProxy<Env>>>;

export type LocalD1 = {
  proxy: LocalD1Proxy;
  db: Database;
};

/**
 * Boots a private D1 for the calling suite.
 *
 * Call it from `beforeAll` with `import.meta.url`: the file's path names the
 * directory, so a rerun of the same suite starts from a clean copy of the
 * template and two files never collide.
 */
export async function startLocalD1(moduleUrl: string): Promise<LocalD1> {
  const statePath = join(suitesRoot, suiteKey(moduleUrl));
  await rm(statePath, { recursive: true, force: true });
  try {
    await cp(templateRoot, statePath, { recursive: true });
  } catch (error) {
    throw new Error(
      `Local D1 template is missing at ${templateRoot}. Run \`pnpm db:migrate:test\` first.`,
      { cause: error },
    );
  }
  const proxy = await getPlatformProxy<Env>({
    configPath: join(appRoot, "wrangler.jsonc"),
    persist: { path: statePath },
    remoteBindings: false,
  });
  return { proxy, db: createDatabase(proxy.env.DB) };
}

/** `src/lib/blog.integration.test.ts` → `lib-blog`, readable under `.wrangler`. */
function suiteKey(moduleUrl: string): string {
  return relative(appRoot, fileURLToPath(moduleUrl))
    .replace(/\.integration\.test\.tsx?$/u, "")
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}
