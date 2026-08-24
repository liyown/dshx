import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { sha256 } from "@/lib/auth/tokens.server";
import { createDatabase, type Database } from "@/lib/db/client";
import { catalogSyncItems, catalogSyncRuns } from "@/lib/db/schema";
import { storeMedia } from "@/lib/media.server";
import type { CatalogProposalV2 } from "./contracts";
import { getCatalogPlugin, listCatalogPlugins } from "./repository.server";
import { contentSourceMaterial, promoteRun, stageItems } from "./sync.server";

async function proposal(
  label: string,
  identity = `npm:@fixture/${label}`,
): Promise<CatalogProposalV2> {
  const now = new Date().toISOString();
  const packageName = identity.slice("npm:".length);
  const sourceSha = "a".repeat(64);
  const artifactSha = "b".repeat(64);
  const packageJsonSha = "c".repeat(64);
  const patchSha = "d".repeat(64);
  const sources = [
    {
      kind: "readme",
      purpose: "content" as const,
      url: `https://github.com/fixture/${label}/blob/main/README.md`,
      observedAt: now,
      sha256: sourceSha,
      ref: "main",
    },
    {
      kind: "npm-tarball",
      purpose: "verification" as const,
      url: `https://registry.npmjs.org/${packageName}/-/${label}.tgz`,
      observedAt: now,
      sha256: artifactSha,
      ref: "1.0.0",
    },
  ];
  const contentSourceHash = await sha256(contentSourceMaterial(sources));
  const checks = [
    {
      code: "patch.array",
      status: "pass" as const,
      observed: null,
      evidenceUrl: sources[1]!.url,
      evidenceSha: artifactSha,
    },
  ];
  const localize = (locale: "en" | "zh") => ({
    locale,
    displayName: locale === "en" ? "Fixture Plugin" : "测试插件",
    shortDescription:
      locale === "en"
        ? "A deterministic DSH plugin used for integration tests."
        : "用于确定性集成测试的 DSH 插件，包含完整双语目录信息。",
    overviewMarkdown:
      locale === "en"
        ? "This fixture exercises catalog promotion without running any third-party package code."
        : "这个测试插件用于验证目录晋升流程，并且不会执行任何第三方代码、安装脚本或软件包生命周期钩子。所有验证都只读取声明和归档内容。",
    highlights:
      locale === "en"
        ? ["Deterministic validation", "Safe fixture"]
        : ["确定性验证", "安全测试数据"],
    installNotesMarkdown: null,
    seoTitle: locale === "en" ? "Fixture Plugin for DSHX Hub" : "DSHX Hub 测试插件",
    seoDescription:
      locale === "en"
        ? "A verified fixture plugin for exercising DSHX Hub catalog, localization, and SEO behavior."
        : "一个经过验证的测试插件，用于检查 DSHX Hub 插件目录、多语言结构化内容、搜索索引和 SEO 元数据的完整行为。",
    sourceLocale: "en" as const,
    sourceContentHash: contentSourceHash,
    status: "ready" as const,
    translator: locale === "en" ? ("upstream" as const) : ("agent" as const),
  });
  return {
    schemaVersion: 2,
    identity: { kind: "npm", packageName },
    contentSourceHash,
    sources,
    verification: {
      schemaVersion: 1,
      checkerVersion: "3",
      checkedAt: now,
      identityKey: identity,
      artifactSha256: artifactSha,
      packageJsonSha256: packageJsonSha,
      patchSha256: patchSha,
      packageName,
      packageVersion: "1.0.0",
      patchPath: "dsh.patch.json",
      dshxDetected: false,
      qualified: true,
      checks,
    },
    repository: {
      githubId: `repo-${label}`,
      nodeId: null,
      owner: {
        githubId: `owner-${label}`,
        login: `fixture-${label}`,
        kind: "user",
        displayName: "Fixture",
        avatarUrl: `https://avatars.githubusercontent.com/u/${label.length}`,
        profileUrl: "https://github.com/fixture",
        bio: null,
        websiteUrl: null,
      },
      name: label,
      fullName: `fixture/${label}`,
      canonicalUrl: `https://github.com/fixture/${label}`,
      defaultBranch: "main",
      description: "fixture",
      homepageUrl: null,
      topics: ["dsh-plugin"],
      primaryLanguage: "TypeScript",
      licenseSpdx: "MIT",
      isFork: false,
      isArchived: false,
      isDisabled: false,
      etag: null,
      sourceHash: "e".repeat(64),
      createdAt: now,
      updatedAt: now,
      pushedAt: now,
    },
    repositoryPackage: {
      subdirectory: "",
      packageName,
      packageVersion: "1.0.0",
      packageJsonSha,
      patchPath: "dsh.patch.json",
      patchSha,
      npmPackageName: packageName,
      npmRegistryUrl: `https://www.npmjs.com/package/${packageName}`,
      installKind: "npm",
      installSpec: `${packageName}@1.0.0`,
      dshBundle: true,
      dshxDetected: false,
      qualificationStatus: "verified",
      consecutiveFailures: 0,
      checks,
    },
    plugin: {
      requestedSlug: `fixture-${label}`,
      packageName,
      latestVersion: "1.0.0",
      compatibilityRange: "dsh >=0.1",
      licenseSpdx: "MIT",
      homepageUrl: null,
      repositoryUrl: `https://github.com/fixture/${label}`,
      dshxDetected: false,
    },
    localizations: [localize("en"), localize("zh")],
    installTargets: [
      {
        kind: "npm",
        spec: `${packageName}@1.0.0`,
        packageName,
        version: "1.0.0",
        integrity: "sha512-fixture",
        primary: true,
      },
    ],
    releases: [
      {
        version: "1.0.0",
        channel: "stable",
        gitTag: "v1.0.0",
        commitSha: null,
        compatibilityRange: "dsh >=0.1",
        compatibilitySource: "manifest",
        releaseNotesUrl: null,
        deprecated: false,
        publishedAt: now,
        dependencies: [{ packageName: "dsh", versionRange: ">=0.1", kind: "peer" }],
      },
    ],
    categories: ["tools"],
    capabilities: [{ kind: "tool", identifier: "fixture", observed: true, metadata: null }],
    links: [{ kind: "repository", url: `https://github.com/fixture/${label}`, label: "GitHub" }],
  };
}

describe("CatalogProposalV2 sync with local D1", () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
  let db: Database;

  beforeAll(async () => {
    proxy = await getPlatformProxy<Env>({
      configPath: "wrangler.jsonc",
      persist: true,
      remoteBindings: false,
    });
    db = createDatabase(proxy.env.DB);
  });

  afterAll(async () => {
    await proxy.dispose();
  });

  it("rejects an invalid page without storing valid siblings", async () => {
    const runId = crypto.randomUUID();
    const valid = await proposal(`valid-${runId.slice(0, 8)}`);
    const invalid = await proposal(`invalid-${runId.slice(0, 8)}`);
    invalid.localizations[1]!.sourceContentHash = "f".repeat(64);
    await db.insert(catalogSyncRuns).values({
      id: runId,
      mode: "incremental",
      schemaVersion: 2,
      idempotencyKey: `test-${runId}`,
      expectedItems: 2,
    });
    await expect(stageItems(proxy.env.DB, db, runId, [valid, invalid])).rejects.toThrow(
      "invalid proposals",
    );
    const count = await db.get<{ count: number }>(sql`
      select count(*) count from catalog_sync_items where run_id=${runId}
    `);
    expect(count?.count).toBe(0);
  });

  it("resolves identity, stages idempotently, promotes, and deduplicates media", async () => {
    const runId = crypto.randomUUID();
    const candidate = await proposal(`publish-${runId.slice(0, 8)}`);
    await db.insert(catalogSyncRuns).values({
      id: runId,
      mode: "incremental",
      schemaVersion: 2,
      idempotencyKey: `test-${runId}`,
      expectedItems: 1,
    });
    const first = await stageItems(proxy.env.DB, db, runId, [candidate]);
    const second = await stageItems(proxy.env.DB, db, runId, [candidate]);
    expect(first.results[0]).toEqual(second.results[0]);
    expect(await promoteRun(proxy.env.DB, db, runId)).toMatchObject({
      status: "committed",
      published: 1,
    });
    const canonical = first.results[0]!;
    const detail = await getCatalogPlugin(db, canonical.slug, "zh");
    expect(detail?.plugin.name).toBe("测试插件");
    expect(detail?.plugin.publisher.avatarUrl).toBe(candidate.repository.owner.avatarUrl);
    expect(detail?.indexable).toBe(true);
    expect(
      (
        await listCatalogPlugins(db, { locale: "en", q: "Fixture", sort: "featured", limit: 24 })
      ).items.some((entry) => entry.slug === canonical.slug),
    ).toBe(true);

    const png = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      0,
      0,
      0,
      13,
      0x49,
      0x48,
      0x44,
      0x52,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      1,
      ...new TextEncoder().encode(runId),
    ]);
    const mediaHash = await sha256(png.slice().buffer);
    const mediaForm = () => {
      const form = new FormData();
      form.set(
        "metadata",
        JSON.stringify({
          schemaVersion: 2,
          pluginId: canonical.pluginId,
          kind: "icon",
          sourceUrl: "https://github.com/fixture/assets/icon.png",
          observedAt: new Date().toISOString(),
          sourceSha256: mediaHash,
          localizations: [
            { locale: "en", altText: "Fixture icon" },
            { locale: "zh", altText: "测试图标" },
          ],
        }),
      );
      form.set("file", new File([png], "icon.png", { type: "image/png" }));
      return form;
    };
    expect((await storeMedia(db, proxy.env.PLUGIN_MEDIA, mediaForm())).deduplicated).toBe(false);
    expect((await storeMedia(db, proxy.env.PLUGIN_MEDIA, mediaForm())).deduplicated).toBe(true);
  });

  it("rejects duplicate identities before writing the page", async () => {
    const runId = crypto.randomUUID();
    const candidate = await proposal(`duplicate-${runId.slice(0, 8)}`);
    await db.insert(catalogSyncRuns).values({
      id: runId,
      mode: "full",
      schemaVersion: 2,
      idempotencyKey: `test-${runId}`,
      expectedItems: 2,
    });
    await expect(
      stageItems(proxy.env.DB, db, runId, [candidate, structuredClone(candidate)]),
    ).rejects.toThrow("duplicate identities");
    expect(
      await db
        .select()
        .from(catalogSyncItems)
        .where(sql`${catalogSyncItems.runId}=${runId}`),
    ).toHaveLength(0);
  });

  it("resolves colliding requested slugs inside one proposal page", async () => {
    const runId = crypto.randomUUID();
    const first = await proposal(`slug-a-${runId.slice(0, 8)}`);
    const second = await proposal(`slug-b-${runId.slice(0, 8)}`);
    first.plugin.requestedSlug = "shared-fixture-slug";
    second.plugin.requestedSlug = "shared-fixture-slug";
    await db.insert(catalogSyncRuns).values({
      id: runId,
      mode: "incremental",
      schemaVersion: 2,
      idempotencyKey: `test-${runId}`,
      expectedItems: 2,
    });
    const staged = await stageItems(proxy.env.DB, db, runId, [first, second]);
    expect(new Set(staged.results.map((result) => result.slug)).size).toBe(2);
    expect(await promoteRun(proxy.env.DB, db, runId)).toMatchObject({
      status: "committed",
      published: 2,
    });
  });
});
