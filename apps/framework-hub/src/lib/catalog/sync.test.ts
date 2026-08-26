import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { sha256 } from "@/lib/auth/tokens.server";
import { createDatabase, type Database } from "@/lib/db/client";
import {
  catalogSyncItems,
  catalogSyncRuns,
  pluginInstallTargets,
  pluginMetricsCurrent,
  pluginReleases,
  plugins,
  repositories,
} from "@/lib/db/schema";
import { storeMedia } from "@/lib/media.server";
import { catalogProposalV2Schema, type CatalogProposalV2 } from "./contracts";
import {
  getCatalogMarketplacePlugin,
  getCatalogPlugin,
  listCatalogDiscovery,
  listCatalogMarketplace,
  listCatalogPlugins,
} from "./repository.server";
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
      compatibilityRange: ">=0.1.0-rc.8 <0.2.0-0",
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
        compatibilityRange: ">=0.1.0-rc.8 <0.2.0-0",
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

  it("rejects malformed compatibility ranges while allowing an unknown release range", async () => {
    const valid = await proposal(`compat-${crypto.randomUUID().slice(0, 8)}`);
    valid.releases[0]!.compatibilityRange = null;
    expect(catalogProposalV2Schema.safeParse(valid).success).toBe(true);

    const invalidPlugin = structuredClone(valid);
    invalidPlugin.plugin.compatibilityRange = "dsh >=0.1";
    expect(catalogProposalV2Schema.safeParse(invalidPlugin)).toMatchObject({ success: false });

    const invalidRelease = structuredClone(valid);
    invalidRelease.releases[0]!.compatibilityRange = "not a semver range";
    expect(catalogProposalV2Schema.safeParse(invalidRelease)).toMatchObject({ success: false });
  });

  it("validates immutable npm and GitHub primary install specs", async () => {
    const mutableNpm = await proposal(`mutable-npm-${crypto.randomUUID().slice(0, 8)}`);
    mutableNpm.repositoryPackage.installSpec = `${mutableNpm.plugin.packageName}@latest`;
    mutableNpm.installTargets[0]!.spec = `${mutableNpm.plugin.packageName}@latest`;
    expect(catalogProposalV2Schema.safeParse(mutableNpm)).toMatchObject({ success: false });

    const github = await proposal(`github-spec-${crypto.randomUUID().slice(0, 8)}`);
    github.identity = {
      kind: "github",
      repositoryId: github.repository.githubId,
      subdirectory: "",
    };
    github.verification.identityKey = `github:${github.repository.githubId}:`;
    github.repositoryPackage.npmPackageName = null;
    github.repositoryPackage.npmRegistryUrl = null;
    github.repositoryPackage.installKind = "github";
    github.repositoryPackage.installSpec = `github:${github.repository.fullName}#v1.0.0`;
    github.installTargets[0] = {
      ...github.installTargets[0]!,
      kind: "github",
      spec: `github:${github.repository.fullName}#v1.0.0`,
    };
    expect(catalogProposalV2Schema.safeParse(github)).toMatchObject({ success: true });

    github.repositoryPackage.installSpec = `github:${github.repository.fullName}#main`;
    github.installTargets[0]!.spec = `github:${github.repository.fullName}#main`;
    expect(catalogProposalV2Schema.safeParse(github)).toMatchObject({ success: false });
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

  it("returns localized categories with category filtering and cursor pagination", async () => {
    const runId = crypto.randomUUID();
    const candidates = await Promise.all([
      proposal(`market-a-${runId.slice(0, 8)}`),
      proposal(`market-b-${runId.slice(0, 8)}`),
    ]);
    await db.insert(catalogSyncRuns).values({
      id: runId,
      mode: "incremental",
      schemaVersion: 2,
      idempotencyKey: `test-${runId}`,
      expectedItems: candidates.length,
    });
    await stageItems(proxy.env.DB, db, runId, candidates);
    await promoteRun(proxy.env.DB, db, runId);

    const query = {
      locale: "en" as const,
      q: "",
      category: "tools",
      sort: "latest" as const,
      limit: 1,
    };
    const first = await listCatalogMarketplace(db, query);
    expect(first.categories).toContainEqual({ slug: "tools", name: "Tools" });
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.category).toBe("tools");
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await listCatalogMarketplace(db, { ...query, cursor: first.nextCursor! });
    expect(second.categories).toEqual(first.categories);
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.slug).not.toBe(first.items[0]?.slug);
    expect(second.items[0]?.category).toBe("tools");

    const localized = await listCatalogMarketplace(db, { ...query, locale: "zh", limit: 24 });
    expect(localized.categories).toContainEqual({ slug: "tools", name: "工具" });
  });

  it("separates published discovery placeholders from the installable marketplace", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const category = `marketplace-${suffix}`;
    const makePlugin = (label: string, verificationStatus: "pending" | "verified") => {
      const packageName = `@fixture/${label}-${suffix}`;
      return {
        id: crypto.randomUUID(),
        slug: `${label}-${suffix}`,
        identityKey: `npm:${packageName}`,
        packageName,
        name: `${label} fixture`,
        description: `${label} marketplace eligibility fixture`,
        authorHandle: "fixture",
        category,
        latestVersion: "1.0.0",
        compatibilityRange: ">=0.1.0-rc.8 <0.2.0-0",
        verificationStatus,
        lifecycleStatus: "active" as const,
        status: "published" as const,
      };
    };
    const validA = makePlugin("installable-a", "verified");
    const validB = makePlugin("installable-b", "verified");
    const unverified = makePlugin("unverified", "pending");
    const withoutTarget = makePlugin("without-target", "verified");
    const staleTarget = makePlugin("stale-target", "verified");
    const duplicatePrimary = makePlugin("duplicate-primary", "verified");
    const mutablePrimary = makePlugin("mutable-primary", "verified");
    const candidates = [
      validA,
      validB,
      unverified,
      withoutTarget,
      staleTarget,
      duplicatePrimary,
      mutablePrimary,
    ];
    for (const candidate of candidates) await db.insert(plugins).values(candidate);

    const target = (
      plugin: (typeof candidates)[number],
      version = plugin.latestVersion,
      spec = `${plugin.packageName}@${version}`,
    ) => ({
      id: crypto.randomUUID(),
      pluginId: plugin.id,
      kind: "npm" as const,
      spec,
      packageName: plugin.packageName,
      version,
      isPrimary: true,
      status: "active" as const,
      verifiedAt: new Date(),
    });
    await db
      .insert(pluginInstallTargets)
      .values([
        target(validA),
        target(validB),
        target(unverified),
        target(staleTarget, "0.9.0"),
        target(duplicatePrimary),
        target(
          duplicatePrimary,
          duplicatePrimary.latestVersion,
          `https://github.com/fixture/${duplicatePrimary.slug}.git#v1.0.0`,
        ),
        target(
          mutablePrimary,
          mutablePrimary.latestVersion,
          `${mutablePrimary.packageName}@latest`,
        ),
      ]);

    const query = {
      locale: "en" as const,
      q: "",
      category,
      sort: "updated" as const,
      limit: 24,
    };
    const discovery = await listCatalogPlugins(db, query);
    expect(discovery.items.map((item) => item.slug)).toHaveLength(candidates.length);
    expect(discovery.items.map((item) => item.slug)).toEqual(
      expect.arrayContaining(candidates.map((item) => item.slug)),
    );
    const discoveryResponse = await listCatalogDiscovery(db, query);
    expect({
      items: discoveryResponse.items,
      nextCursor: discoveryResponse.nextCursor,
    }).toEqual(discovery);

    const first = await listCatalogMarketplace(db, { ...query, sort: "latest", limit: 1 });
    expect(first.categories).toContainEqual({ slug: "tools", name: "Tools" });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await listCatalogMarketplace(db, {
      ...query,
      sort: "latest",
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((item) => item.slug)).toEqual(
      expect.arrayContaining([validA.slug, validB.slug]),
    );

    await expect(getCatalogMarketplacePlugin(db, validA.slug, "en")).resolves.toMatchObject({
      id: validA.id,
    });
    await expect(getCatalogMarketplacePlugin(db, unverified.slug, "en")).resolves.toBeNull();
    await expect(getCatalogMarketplacePlugin(db, withoutTarget.slug, "en")).resolves.toBeNull();
    await expect(getCatalogMarketplacePlugin(db, staleTarget.slug, "en")).resolves.toBeNull();
    await expect(getCatalogMarketplacePlugin(db, duplicatePrimary.slug, "en")).resolves.toBeNull();
  });

  it("admits only a GitHub target pinned to the canonical repository latest stable tag", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const category = `github-exact-${suffix}`;
    const records = ["exact", "mutable"].map((label) => ({
      label,
      pluginId: crypto.randomUUID(),
      repositoryId: crypto.randomUUID(),
      repositoryName: `${label}-${suffix}`,
      packageName: `@fixture/github-${label}-${suffix}`,
    }));
    const now = new Date();

    await db.insert(repositories).values(
      records.map((record) => ({
        id: record.repositoryId,
        githubId: `github-${record.repositoryId}`,
        ownerLogin: "fixture",
        name: record.repositoryName,
        fullName: `fixture/${record.repositoryName}`,
        canonicalUrl: `https://github.com/fixture/${record.repositoryName}`,
        defaultBranch: "main",
      })),
    );
    await db.insert(plugins).values(
      records.map((record) => ({
        id: record.pluginId,
        slug: `github-${record.label}-${suffix}`,
        identityKey: `github:github-${record.repositoryId}:`,
        packageName: record.packageName,
        name: `GitHub ${record.label} fixture`,
        description: "A verified GitHub marketplace exact-spec fixture.",
        authorHandle: "fixture",
        category,
        latestVersion: "1.0.0",
        compatibilityRange: ">=0.1.0-rc.8 <0.2.0-0",
        primaryRepositoryId: record.repositoryId,
        verificationStatus: "verified" as const,
        lifecycleStatus: "active" as const,
        status: "published" as const,
        repositoryUrl: `https://github.com/fixture/${record.repositoryName}`,
      })),
    );
    await db.insert(pluginReleases).values(
      records.map((record) => ({
        id: crypto.randomUUID(),
        pluginId: record.pluginId,
        version: "1.0.0",
        channel: "stable" as const,
        gitTag: "v1.0.0",
        compatibilityRange: ">=0.1.0-rc.8 <0.2.0-0",
        publishedAt: now,
      })),
    );
    await db.insert(pluginInstallTargets).values(
      records.map((record) => ({
        id: crypto.randomUUID(),
        pluginId: record.pluginId,
        kind: "github" as const,
        spec:
          record.label === "exact"
            ? `github:fixture/${record.repositoryName}#v1.0.0`
            : `github:fixture/${record.repositoryName}#main`,
        packageName: record.packageName,
        version: "1.0.0",
        isPrimary: true,
        status: "active" as const,
        verifiedAt: now,
      })),
    );

    const page = await listCatalogMarketplace(db, {
      locale: "en",
      q: "",
      category,
      sort: "latest",
      limit: 24,
    });
    expect(page.items.map((item) => item.slug)).toEqual([`github-exact-${suffix}`]);
    await expect(
      getCatalogMarketplacePlugin(db, `github-exact-${suffix}`, "en"),
    ).resolves.toMatchObject({
      repositoryUrl: `https://github.com/fixture/exact-${suffix}`,
      releases: [
        expect.objectContaining({
          version: "1.0.0",
          channel: "stable",
          git_tag: "v1.0.0",
        }),
      ],
    });
    await expect(
      getCatalogMarketplacePlugin(db, `github-mutable-${suffix}`, "en"),
    ).resolves.toBeNull();
  });

  it("sorts installable plugins by real metrics and latest release time with stable cursors", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const category = `ordering-${suffix}`;
    const base = Date.UTC(2026, 0, 1);
    const records = [
      { label: "alpha", stars: 30, downloads: null, releaseAt: base + 1_000 },
      { label: "beta", stars: 10, downloads: 900, releaseAt: base + 3_000 },
      { label: "gamma", stars: 20, downloads: 100, releaseAt: base + 2_000 },
      { label: "delta", stars: 15, downloads: 50, releaseAt: base + 2_000 },
      { label: "epsilon", stars: 5, downloads: 25, releaseAt: null },
    ].map((record) => ({
      ...record,
      id: crypto.randomUUID(),
      slug: `${record.label}-${suffix}`,
      packageName: `@fixture/${record.label}-${suffix}`,
    }));
    const tiedById = records
      .filter((record) => record.releaseAt === base + 2_000)
      .sort((left, right) => right.id.localeCompare(left.id));

    for (const [index, record] of records.entries()) {
      const isFirstTie = record.id === tiedById[0]?.id;
      await db.insert(plugins).values({
        id: record.id,
        slug: record.slug,
        identityKey: `npm:${record.packageName}`,
        packageName: record.packageName,
        name: `${record.label} ordering fixture`,
        description: "A marketplace ordering fixture with verified publication metadata.",
        authorHandle: "fixture",
        category,
        latestVersion: "1.0.0",
        compatibilityRange: ">=0.1.0-rc.8 <0.2.0-0",
        verificationStatus: "verified",
        lifecycleStatus: "active",
        status: "published",
        updatedAt: new Date(base + (isFirstTie ? 4_000 : 9_000 + index)),
      });
      await db.insert(pluginInstallTargets).values({
        id: crypto.randomUUID(),
        pluginId: record.id,
        kind: "npm",
        spec: `${record.packageName}@1.0.0`,
        packageName: record.packageName,
        version: "1.0.0",
        isPrimary: true,
        status: "active",
        verifiedAt: new Date(base),
      });
      await db.insert(pluginReleases).values({
        id: crypto.randomUUID(),
        pluginId: record.id,
        version: "1.0.0",
        channel: "stable",
        compatibilityRange: ">=0.1.0-rc.8 <0.2.0-0",
        publishedAt: record.releaseAt === null ? null : new Date(record.releaseAt),
      });
      await db.insert(pluginMetricsCurrent).values({
        pluginId: record.id,
        githubStars: record.stars,
        npmDownloadsWeek: record.downloads,
      });
    }

    const query = { locale: "en" as const, q: "", category, limit: 24 };
    const byStars = await listCatalogMarketplace(db, { ...query, sort: "stars" });
    expect(byStars.items.map((item) => item.slug)).toEqual(
      records
        .slice()
        .sort((left, right) => right.stars - left.stars)
        .map((record) => record.slug),
    );
    const byDownloads = await listCatalogMarketplace(db, { ...query, sort: "downloads" });
    expect(byDownloads.items.map((item) => item.slug)).toEqual(
      records
        .slice()
        .sort((left, right) => (right.downloads ?? 0) - (left.downloads ?? 0))
        .map((record) => record.slug),
    );
    expect(byDownloads.items.find((item) => item.slug === records[0]!.slug)).toMatchObject({
      downloads: "—",
    });

    const expectedLatest = records
      .slice()
      .sort(
        (left, right) =>
          (right.releaseAt ?? 0) - (left.releaseAt ?? 0) || right.id.localeCompare(left.id),
      );
    const latestSlugs: string[] = [];
    let cursor: string | null | undefined;
    do {
      const page = await listCatalogMarketplace(db, {
        ...query,
        sort: "latest",
        limit: 1,
        ...(cursor ? { cursor } : {}),
      });
      latestSlugs.push(...page.items.map((item) => item.slug));
      cursor = page.nextCursor;
    } while (cursor);
    expect(latestSlugs).toEqual(expectedLatest.map((record) => record.slug));
    expect(
      (await listCatalogMarketplace(db, { ...query, sort: "latest" })).items.map(
        (item) => item.publishedAt,
      ),
    ).toEqual(
      expectedLatest.map((record) =>
        record.releaseAt === null ? null : new Date(record.releaseAt).toISOString(),
      ),
    );
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
