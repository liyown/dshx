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

  it("keeps interface copy in the message tables, not in locale branches", async () => {
    const files = (await sourceFiles()).filter(
      ({ path }) => !path.startsWith("lib/i18n/") && !path.startsWith("lib/docs/"),
    );
    const localeBranch = /(?<![\w.])locale\s*[!=]==?\s*["'](?:en|zh)["']\s*\?\s*["'`]/;
    const localCopyTable =
      /(?:const|let)\s+\w*(?:[Cc]opy|[Mm]essages)\s*(?::[^=\n]+)?=\s*\{\s*(?:en|zh)\s*:/;
    expect(
      violations(files, ({ text }) => localeBranch.test(text) || localCopyTable.test(text)),
    ).toEqual([]);
  });

  it("keeps every schema.org node and head assembly inside the page-head module", async () => {
    const files = (await sourceFiles()).filter(({ path }) => !path.startsWith("lib/seo/"));
    // A page says what it is; `lib/seo` says how that is rendered. When routes
    // spelled out their own nodes, the same directory or article shape existed
    // in thirteen places and a metadata rule could not change once.
    expect(
      violations(
        files,
        ({ text }) => /["']@type["']\s*:/.test(text) || /["']@context["']\s*:/.test(text),
      ),
    ).toEqual([]);
  });

  it("keeps the install-target rule in the contracts package", async () => {
    const files = await sourceFiles();
    // Whether a spec is safe to hand to a shell is one decision. It lives in
    // @becomeopc/dshx-hub-contracts, together with the payload shape that
    // carries it, so the Hub and the CLI cannot disagree about it. A copy
    // here is how the ingest gate, the publication gate and the rendered
    // command drifted apart in the first place.
    expect(
      violations(files, ({ text }) => /charCodeAt\(0\)\s*<=\s*32|\\u0000-\\u0020/.test(text)),
    ).toEqual([]);
  });

  it("keeps one canonical JSON spelling in the Hub", async () => {
    const files = await sourceFiles();
    // Every hash, id and "did this change?" comparison is a string comparison
    // over this serialization, so two spellings mean two answers the first
    // time either changes. The catalog and the approval ledger both hash with
    // the contracts package's `canonicalJson`; a local copy is how the
    // approvals serializer drifted from the one the wire contract uses.
    expect(
      violations(
        files,
        ({ path, text }) =>
          path.startsWith("lib/") &&
          /function (?:canonicalize|canonicalJson|stableJson)\s*\(/u.test(text),
      ),
    ).toEqual([]);
  });

  it("keeps approval transitions and subject rules free of persistence", async () => {
    const files = (await sourceFiles()).filter(({ path }) =>
      ["lib/approvals/transitions.ts", "lib/approvals/subject.ts"].includes(path),
    );
    // Whether an irreversible write may proceed is a decision, not a query.
    // Keeping these two files free of D1, Drizzle and `.server` imports is
    // what lets the rules be tested without a database; see DECISIONS.md.
    expect(
      violations(files, ({ text }) =>
        /from\s+["'][^"']*(?:drizzle-orm|\/db\/|\.server|cloudflare:workers)/u.test(text),
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

  it("keeps one pagination cursor format", async () => {
    const files = await sourceFiles();
    // Four base64url encoders meant four decode rules and two failure
    // policies; the codec owns the format, the adapter owns what a bad cursor
    // means.
    expect(
      violations(
        files,
        ({ path, text }) => path !== "lib/catalog/cursor.ts" && /btoa\(JSON\.stringify/u.test(text),
      ),
    ).toEqual([]);
  });

  it("keeps the needs rule and its SQL projection in one policy module", async () => {
    const files = await sourceFiles();
    expect(
      violations(
        files,
        ({ path, text }) =>
          path !== "lib/catalog/operations/plugins/policy.ts" &&
          /json_type\(o\.facts_json/u.test(text),
      ),
    ).toEqual([]);
  });

  it("keeps observation recency and provenance in the merge module", async () => {
    const files = await sourceFiles();
    expect(
      violations(
        files,
        ({ path, text }) =>
          path !== "lib/catalog/operations/observation/merge.ts" &&
          /installTargets\.primary/u.test(text),
      ),
    ).toEqual([]);
  });

  it("keeps the operations API behind one entry point", async () => {
    const files = await sourceFiles();
    // The modules under `operations/` are free to move as long as nobody
    // outside the directory reaches past the barrel that names them.
    expect(
      violations(
        files,
        ({ path, text }) =>
          !path.startsWith("lib/catalog/operations/") &&
          /from\s+["'][^"']*catalog\/operations\/(?!["'])/u.test(text),
      ),
    ).toEqual([]);
  });

  it("keeps one sha-256 spelling in the catalog", async () => {
    const files = await sourceFiles();
    expect(
      violations(
        files,
        ({ path, text }) =>
          path.startsWith("lib/catalog/") &&
          path !== "lib/catalog/digest.ts" &&
          /\.toString\(16\)\.padStart\(2, "0"\)/u.test(text),
      ),
    ).toEqual([]);
  });

  it("keeps the operations report day boundary in one module", async () => {
    const files = await sourceFiles();
    expect(
      violations(
        files,
        ({ path, text }) => path !== "lib/catalog/operation-report-day.ts" && /\+8 hours/u.test(text),
      ),
    ).toEqual([]);
  });

  it("keeps the plugin row lookup in the operations store", async () => {
    const files = await sourceFiles();
    expect(
      violations(
        files,
        ({ path, text }) =>
          path !== "lib/catalog/operations/store.ts" &&
          /from plugins where id=\? or slug=\?/u.test(text),
      ),
    ).toEqual([]);
  });

  it("keeps every API handler behind the route module", async () => {
    const files = (await sourceFiles()).filter(({ path }) => path.startsWith("routes/api/"));
    // Authentication order, body validation, the query contract and the
    // response envelope are one decision each, and `lib/api/route.ts` is where
    // they live. These six files answer a protocol rather than the API.
    const protocolAdapters = [
      "routes/api/auth/$.ts",
      "routes/api/cli/authorizations/$id/approve.ts",
      "routes/api/config.ts",
      "routes/api/github-stars.ts",
      "routes/api/health.ts",
      "routes/api/media/$id.ts",
    ];
    const primitives =
      /\b(?:jsonError|readJson|readOperationJson|operationSuccess|operationFailure|requireSession|requireAdminSession|requireSameOrigin|requireApiToken|requireAdminApiToken|requireCommunityWrite)\b/u;
    expect(
      violations(
        files.filter(({ path }) => !protocolAdapters.includes(path)),
        ({ text }) => primitives.test(text) || !/from\s+["']@\/lib\/api\/route["']/u.test(text),
      ),
    ).toEqual([]);
    expect(files.filter(({ path }) => protocolAdapters.includes(path)).length).toBe(
      protocolAdapters.length,
    );
  });

  it("keeps browser response parsing on the shared contracts", async () => {
    // Every endpoint's answer is described once, beside the endpoint, and both
    // the handler and the browser parse that description. A UI module that
    // writes its own schema is guessing what the server sends.
    const ui = (await sourceFiles()).filter(
      ({ path }) => path.startsWith("components/") || path.startsWith("routes/"),
    );
    const localZodAllowed = [
      // A route's own search params, validated by the router rather than by an endpoint.
      "routes/admin/approvals/index.tsx",
      // The only zod import left is the `ZodType` type its helper takes.
      "components/community/account-pages.tsx",
    ];
    const importingZod = ui
      .filter(({ path }) => !path.startsWith("routes/api/"))
      .filter(({ text }) => /from\s+["']zod["']/u.test(text))
      .map(({ path }) => path)
      .filter((path) => !localZodAllowed.includes(path));
    expect(importingZod).toEqual([]);
    const apiCallsWithoutContract = ui
      .filter(({ path }) => !path.startsWith("routes/api/"))
      .filter(({ text }) => /apiRequest\(/u.test(text))
      .filter(({ text }) => !/from\s+["']@\/lib\/[^"']*contracts["']/u.test(text))
      .map(({ path }) => path);
    expect(apiCallsWithoutContract).toEqual([]);
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
