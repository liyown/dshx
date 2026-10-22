import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const allowedNativeD1Adapter = "lib/db/batch.ts";

async function sourceFiles(directory = sourceRoot): Promise<Array<{ path: string; text: string }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filePath = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(filePath);
      if (
        !/\.(?:ts|tsx)$/.test(entry.name) ||
        /(?:\.test|\.integration\.test)\.tsx?$/.test(entry.name)
      )
        return [];
      return [{ path: relative(sourceRoot, filePath), text: await readFile(filePath, "utf8") }];
    }),
  );
  return nested.flat();
}

function violations(
  files: Awaited<ReturnType<typeof sourceFiles>>,
  predicate: (file: (typeof files)[number]) => boolean,
) {
  return files.filter(predicate).map((file) => file.path);
}

describe("Framework Hub architecture boundaries", () => {
  it("keeps client and UI modules independent from server infrastructure", async () => {
    const files = await sourceFiles();
    const clientFiles = files.filter(
      ({ path }) =>
        path.startsWith("components/") ||
        ["lib/api-client.ts", "lib/query-client.ts", "lib/auth/client.ts"].includes(path),
    );
    expect(
      violations(clientFiles, ({ text }) =>
        /(?:from|import\s*\()\s*["'][^"']*(?:\.server|\/db\/|cloudflare:workers)/.test(text),
      ),
    ).toEqual([]);
  });

  it("keeps SQL, Drizzle, and repositories out of route modules", async () => {
    const routes = (await sourceFiles()).filter(({ path }) => path.startsWith("routes/"));
    expect(
      violations(routes, ({ text }) =>
        /from\s+["']drizzle-orm["']|repository\.server|parameterizedSql\(|\.(?:select|insert|update|delete)\(/.test(
          text,
        ),
      ),
    ).toEqual([]);
  });

  it("keeps domain contracts independent from UI and platform frameworks", async () => {
    const domain = (await sourceFiles()).filter(
      ({ path }) => path.includes(".domain.") || path.endsWith("/contracts.ts"),
    );
    expect(
      violations(domain, ({ text }) =>
        /from\s+["'](?:react|@tanstack\/|cloudflare:workers)|from\s+["'][^"']*components\//.test(
          text,
        ),
      ),
    ).toEqual([]);
  });

  it("confines native D1 statement preparation to the Drizzle batch adapter", async () => {
    const files = await sourceFiles();
    expect(
      violations(
        files,
        ({ path, text }) => path !== allowedNativeD1Adapter && /\.prepare\s*\(/.test(text),
      ),
    ).toEqual([]);
  });

  it("keeps the install-target rule in its policy module", async () => {
    const files = await sourceFiles();
    // Whether a spec is safe to hand to a shell is one decision; a second
    // copy in an adapter is how the ingest gate, the publication gate and the
    // rendered command drift apart.
    expect(
      violations(
        files,
        ({ path, text }) =>
          !path.startsWith("lib/catalog/install-target/") &&
          /charCodeAt\(0\)\s*<=\s*32|\\u0000-\\u0020/.test(text),
      ),
    ).toEqual([]);
  });

  it("keeps the install readiness projection to one writer", async () => {
    const files = await sourceFiles();
    const allowed = [
      "lib/db/schema.ts",
      "lib/catalog/install-readiness.ts",
      "lib/catalog/install-readiness.server.ts",
    ];
    expect(
      violations(
        files,
        ({ path, text }) => !allowed.includes(path) && /plugin_readiness/.test(text),
      ),
    ).toEqual([]);
  });

  it("keeps the curation quality rule in its policy module", async () => {
    const files = await sourceFiles();
    // The placeholder phrases are the tells of a copied rule. The SQL twin and
    // the pure predicate must both read them from curation-policy.ts.
    expect(
      violations(
        files,
        ({ path, text }) =>
          path !== "lib/catalog/curation-policy.ts" && /a plugin for deepseek harness/u.test(text),
      ),
    ).toEqual([]);
  });
});
