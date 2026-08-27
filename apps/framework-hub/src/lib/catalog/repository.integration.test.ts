import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { createDatabase, type Database } from "@/lib/db/client";
import {
  categories,
  categoryLocalizations,
  pluginCategories,
  pluginMetricsCurrent,
  pluginReleases,
  plugins,
  repositories,
} from "@/lib/db/schema";
import {
  getCatalogMarketplacePlugin,
  listCatalogDiscovery,
  listCatalogMarketplace,
} from "./repository.server";

const compatibilityRange = ">=0.1.0-rc.8 <0.2.0-0";

type PluginFixture = {
  id: string;
  slug: string;
  packageName: string;
  latestVersion: string;
};

type InstallTargetFixture = {
  id: string;
  pluginId: string;
  kind: "npm" | "github";
  spec: string;
  packageName: string;
  version: string;
  isPrimary: boolean;
  status: "active" | "unavailable";
  verifiedAt: Date;
};

function randomSuffix() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

async function insertCategory(db: Database, suffix: string, label: string, sortOrder = 0) {
  const id = crypto.randomUUID();
  const slug = `${label}-${suffix}`;
  await db.insert(categories).values({ id, slug, sortOrder });
  await db.insert(categoryLocalizations).values([
    {
      categoryId: id,
      locale: "en",
      name: `English ${label} ${suffix}`,
    },
    {
      categoryId: id,
      locale: "zh",
      name: `中文 ${label} ${suffix}`,
    },
  ]);
  return { id, slug };
}

async function insertPublishedPlugin(
  db: Database,
  input: {
    suffix: string;
    label: string;
    category: string;
    verificationStatus?: "pending" | "verified" | "failed";
    primaryRepositoryId?: string;
    repositoryUrl?: string;
    updatedAt?: Date;
    publishedAt?: Date | null;
  },
): Promise<PluginFixture> {
  const id = crypto.randomUUID();
  const packageName = `@public-fixture/${input.label}-${input.suffix}`;
  const fixture = {
    id,
    slug: `${input.label}-${input.suffix}`,
    packageName,
    latestVersion: "1.0.0",
  };
  await db.insert(plugins).values({
    ...fixture,
    identityKey: input.primaryRepositoryId
      ? `github:public-fixture/${input.label}-${input.suffix}:`
      : `npm:${packageName}`,
    name: `Public catalog ${input.label} ${input.suffix}`,
    description: `Public catalog repository regression fixture ${input.label} ${input.suffix}.`,
    authorHandle: `fixture-${input.suffix}`,
    category: input.category,
    compatibilityRange,
    verificationStatus: input.verificationStatus ?? "verified",
    lifecycleStatus: "active",
    status: "published",
    primaryRepositoryId: input.primaryRepositoryId,
    repositoryUrl: input.repositoryUrl,
    updatedAt: input.updatedAt,
    publishedAt: input.publishedAt,
  });
  return fixture;
}

async function addCategoryMemberships(db: Database, pluginIds: string[], categoryIds: string[]) {
  await db.insert(pluginCategories).values(
    pluginIds.flatMap((pluginId) =>
      categoryIds.map((categoryId, index) => ({
        pluginId,
        categoryId,
        isPrimary: index === 0,
        sortOrder: index,
      })),
    ),
  );
}

async function addExactNpmTarget(db: Database, plugin: PluginFixture) {
  await insertInstallTargets(db, [
    {
      id: crypto.randomUUID(),
      pluginId: plugin.id,
      kind: "npm",
      spec: `${plugin.packageName}@${plugin.latestVersion}`,
      packageName: plugin.packageName,
      version: plugin.latestVersion,
      isPrimary: true,
      status: "active",
      verifiedAt: new Date(),
    },
  ]);
}

async function insertInstallTargets(db: Database, targets: InstallTargetFixture[]) {
  for (const target of targets) {
    await db.run(sql`
      insert into plugin_install_targets
        (id, plugin_id, kind, spec, package_name, version, is_primary, status, verified_at)
      values
        (${target.id}, ${target.pluginId}, ${target.kind}, ${target.spec}, ${target.packageName},
         ${target.version}, ${target.isPrimary ? 1 : 0}, ${target.status}, ${target.verifiedAt.getTime()})
    `);
  }
}

async function collectMarketplaceSlugs(
  db: Database,
  query: {
    locale: "en" | "zh";
    q: string;
    category: string;
    sort: "stars" | "downloads" | "latest";
    limit: number;
  },
  expectedCount: number,
) {
  const slugs: string[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await listCatalogMarketplace(db, {
      ...query,
      ...(cursor ? { cursor } : {}),
    });
    slugs.push(...page.items.map((item) => item.slug));
    cursor = page.nextCursor;
    expect(slugs.length).toBeLessThanOrEqual(expectedCount);
  } while (cursor);
  expect(new Set(slugs).size).toBe(slugs.length);
  return slugs;
}

describe("public catalog repository loaders", () => {
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

  it("returns localized categories with category filtering and cursor pagination", async () => {
    const suffix = randomSuffix();
    const selected = await insertCategory(db, suffix, "localized", 10);
    const excluded = await insertCategory(db, suffix, "excluded", 11);
    const selectedPlugins = await Promise.all(
      ["localized-a", "localized-b"].map((label) =>
        insertPublishedPlugin(db, {
          suffix,
          label,
          category: selected.slug,
        }),
      ),
    );
    const excludedPlugin = await insertPublishedPlugin(db, {
      suffix,
      label: "localized-decoy",
      category: excluded.slug,
    });
    await addCategoryMemberships(
      db,
      selectedPlugins.map((plugin) => plugin.id),
      [selected.id],
    );
    await addCategoryMemberships(db, [excludedPlugin.id], [excluded.id]);
    await Promise.all(
      [...selectedPlugins, excludedPlugin].map((plugin) => addExactNpmTarget(db, plugin)),
    );

    const query = {
      locale: "en" as const,
      q: "",
      category: selected.slug,
      sort: "latest" as const,
      limit: 1,
    };
    const first = await listCatalogMarketplace(db, query);
    expect(first.categories).toContainEqual({
      slug: selected.slug,
      name: `English localized ${suffix}`,
    });
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.category).toBe(selected.slug);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await listCatalogMarketplace(db, { ...query, cursor: first.nextCursor! });
    expect(second.categories).toEqual(first.categories);
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.slug).not.toBe(first.items[0]?.slug);
    expect(second.items[0]?.category).toBe(selected.slug);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((item) => item.slug)).not.toContain(
      excludedPlugin.slug,
    );

    const localized = await listCatalogMarketplace(db, { ...query, locale: "zh", limit: 24 });
    expect(localized.categories).toContainEqual({
      slug: selected.slug,
      name: `中文 localized ${suffix}`,
    });
  });

  it("filters discovery and marketplace through every normalized category membership", async () => {
    const suffix = randomSuffix();
    const normalizedCategories = await Promise.all(
      ["primary", "secondary", "tertiary"].map((label, index) =>
        insertCategory(db, suffix, label, index),
      ),
    );
    const fixtures = await Promise.all(
      ["normalized-a", "normalized-b"].map((label) =>
        insertPublishedPlugin(db, {
          suffix,
          label,
          category: normalizedCategories[0]!.slug,
        }),
      ),
    );
    await addCategoryMemberships(
      db,
      fixtures.map((plugin) => plugin.id),
      normalizedCategories.map((category) => category.id),
    );
    await Promise.all(fixtures.map((plugin) => addExactNpmTarget(db, plugin)));
    const expectedSlugs = fixtures.map((plugin) => plugin.slug).sort();

    const collect = async (
      list: typeof listCatalogDiscovery | typeof listCatalogMarketplace,
      category: string,
    ) => {
      const slugs: string[] = [];
      let cursor: string | null | undefined;
      do {
        const page = await list(db, {
          locale: "en",
          q: "",
          category,
          sort: "downloads",
          limit: 1,
          ...(cursor ? { cursor } : {}),
        });
        expect(page.items).toHaveLength(1);
        expect(page.items[0]?.category).toBe(normalizedCategories[0]!.slug);
        slugs.push(...page.items.map((item) => item.slug));
        cursor = page.nextCursor;
      } while (cursor);
      return slugs.sort();
    };

    for (const category of normalizedCategories) {
      await expect(collect(listCatalogDiscovery, category.slug)).resolves.toEqual(expectedSlugs);
      await expect(collect(listCatalogMarketplace, category.slug)).resolves.toEqual(expectedSlugs);
    }
  });

  it("ignores legacy verification while requiring one exact usable marketplace target", async () => {
    const suffix = randomSuffix();
    const category = await insertCategory(db, suffix, "eligibility");
    const create = (label: string, verificationStatus: "pending" | "verified" = "verified") =>
      insertPublishedPlugin(db, {
        suffix,
        label,
        category: category.slug,
        verificationStatus,
      });
    const validA = await create("installable-a");
    const validB = await create("installable-b");
    const unverified = await create("unverified", "pending");
    const withoutTarget = await create("without-target");
    const staleTarget = await create("stale-target");
    const duplicatePrimary = await create("duplicate-primary");
    const mutablePrimary = await create("mutable-primary");
    const candidates = [
      validA,
      validB,
      unverified,
      withoutTarget,
      staleTarget,
      duplicatePrimary,
      mutablePrimary,
    ];
    await addCategoryMemberships(
      db,
      candidates.map((plugin) => plugin.id),
      [category.id],
    );

    const target = (
      plugin: PluginFixture,
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
    await insertInstallTargets(db, [
      target(validA),
      target(validB),
      target(unverified),
      target(staleTarget, "0.9.0"),
      target(duplicatePrimary),
      target(
        duplicatePrimary,
        duplicatePrimary.latestVersion,
        `github:public-fixture/${duplicatePrimary.slug}#v1.0.0`,
      ),
      target(mutablePrimary, mutablePrimary.latestVersion, `${mutablePrimary.packageName}@latest`),
    ]);

    const query = {
      locale: "en" as const,
      q: "",
      category: category.slug,
      limit: 24,
    };
    const discovery = await listCatalogDiscovery(db, { ...query, sort: "updated" });
    expect(discovery.items.map((item) => item.slug)).toHaveLength(candidates.length);
    expect(discovery.items.map((item) => item.slug)).toEqual(
      expect.arrayContaining(candidates.map((plugin) => plugin.slug)),
    );

    const marketplaceSlugs = (
      await listCatalogMarketplace(db, { ...query, sort: "latest" })
    ).items.map((item) => item.slug);
    expect(marketplaceSlugs.sort()).toEqual([validA.slug, validB.slug, unverified.slug].sort());
    await expect(getCatalogMarketplacePlugin(db, validA.slug, "en")).resolves.toMatchObject({
      id: validA.id,
    });
    await expect(getCatalogMarketplacePlugin(db, unverified.slug, "en")).resolves.toMatchObject({
      id: unverified.id,
      plugin: { badge: "community" },
    });
    for (const placeholder of [
      withoutTarget,
      staleTarget,
      duplicatePrimary,
      mutablePrimary,
    ]) {
      await expect(getCatalogMarketplacePlugin(db, placeholder.slug, "en")).resolves.toBeNull();
    }
  });

  it("admits only a GitHub target pinned to the canonical repository latest stable tag", async () => {
    const suffix = randomSuffix();
    const category = await insertCategory(db, suffix, "github-exact");
    const records = ["exact", "mutable", "wrong-tag"].map((label) => ({
      label,
      repositoryId: crypto.randomUUID(),
      repositoryName: `${label}-${suffix}`,
    }));
    await db.insert(repositories).values(
      records.map((record) => ({
        id: record.repositoryId,
        githubId: `github-${record.repositoryId}`,
        ownerLogin: `fixture-${suffix}`,
        name: record.repositoryName,
        fullName: `public-fixture/${record.repositoryName}`,
        canonicalUrl: `https://github.com/public-fixture/${record.repositoryName}`,
        defaultBranch: "main",
      })),
    );
    const fixtures = await Promise.all(
      records.map((record) =>
        insertPublishedPlugin(db, {
          suffix,
          label: `github-${record.label}`,
          category: category.slug,
          primaryRepositoryId: record.repositoryId,
          repositoryUrl: `https://github.com/public-fixture/${record.repositoryName}`,
        }),
      ),
    );
    await addCategoryMemberships(
      db,
      fixtures.map((plugin) => plugin.id),
      [category.id],
    );
    const now = new Date();
    await db.insert(pluginReleases).values(
      fixtures.map((plugin) => ({
        id: crypto.randomUUID(),
        pluginId: plugin.id,
        version: plugin.latestVersion,
        channel: "stable" as const,
        gitTag: "v1.0.0",
        compatibilityRange,
        publishedAt: now,
      })),
    );
    await insertInstallTargets(
      db,
      fixtures.map((plugin, index) => ({
        id: crypto.randomUUID(),
        pluginId: plugin.id,
        kind: "github" as const,
        spec:
          index === 0
            ? `github:public-fixture/${records[index]!.repositoryName}#v1.0.0`
            : index === 1
              ? `github:public-fixture/${records[index]!.repositoryName}#main`
              : `github:public-fixture/${records[index]!.repositoryName}#v0.9.0`,
        packageName: plugin.packageName,
        version: plugin.latestVersion,
        isPrimary: true,
        status: "active" as const,
        verifiedAt: now,
      })),
    );

    const page = await listCatalogMarketplace(db, {
      locale: "en",
      q: "",
      category: category.slug,
      sort: "latest",
      limit: 24,
    });
    expect(page.items.map((item) => item.slug)).toEqual([fixtures[0]!.slug]);
    await expect(getCatalogMarketplacePlugin(db, fixtures[0]!.slug, "en")).resolves.toMatchObject({
      repositoryUrl: `https://github.com/public-fixture/${records[0]!.repositoryName}`,
      releases: [
        expect.objectContaining({
          version: "1.0.0",
          channel: "stable",
          git_tag: "v1.0.0",
        }),
      ],
    });
    await expect(getCatalogMarketplacePlugin(db, fixtures[1]!.slug, "en")).resolves.toBeNull();
    await expect(getCatalogMarketplacePlugin(db, fixtures[2]!.slug, "en")).resolves.toBeNull();
  });

  it("keeps stars, downloads, and latest ordering stable across cursors", async () => {
    const suffix = randomSuffix();
    const category = await insertCategory(db, suffix, "ordering");
    const base = Date.UTC(2026, 0, 1);
    const records = [
      {
        label: "alpha",
        stars: 30,
        downloads: null,
        releaseAt: base + 1_000,
        updatedAt: base + 5_000,
      },
      {
        label: "beta",
        stars: 10,
        downloads: 900,
        releaseAt: base + 3_000,
        updatedAt: base + 4_000,
      },
      {
        label: "gamma",
        stars: 20,
        downloads: 100,
        releaseAt: base + 2_000,
        updatedAt: base + 3_000,
      },
      {
        label: "delta",
        stars: 20,
        downloads: 100,
        releaseAt: base + 2_000,
        updatedAt: base + 2_000,
      },
      { label: "epsilon", stars: 5, downloads: 25, releaseAt: null, updatedAt: base + 1_000 },
    ];
    const fixtures: Array<
      (typeof records)[number] & PluginFixture & { updatedAt: number; releaseAt: number | null }
    > = [];
    for (const record of records) {
      const fixture = await insertPublishedPlugin(db, {
        suffix,
        label: record.label,
        category: category.slug,
        updatedAt: new Date(record.updatedAt),
      });
      fixtures.push({ ...record, ...fixture });
      await addExactNpmTarget(db, fixture);
      await db.insert(pluginReleases).values({
        id: crypto.randomUUID(),
        pluginId: fixture.id,
        version: fixture.latestVersion,
        channel: "stable",
        compatibilityRange,
        publishedAt: record.releaseAt === null ? null : new Date(record.releaseAt),
      });
      await db.insert(pluginMetricsCurrent).values({
        pluginId: fixture.id,
        githubStars: record.stars,
        npmDownloadsWeek: record.downloads,
      });
    }
    await addCategoryMemberships(
      db,
      fixtures.map((plugin) => plugin.id),
      [category.id],
    );

    const query = {
      locale: "en" as const,
      q: "",
      category: category.slug,
      limit: 1,
    };
    const byMetric = (metric: "stars" | "downloads") =>
      fixtures
        .slice()
        .sort(
          (left, right) =>
            (metric === "stars" ? right.stars : (right.downloads ?? 0)) -
              (metric === "stars" ? left.stars : (left.downloads ?? 0)) ||
            right.updatedAt - left.updatedAt ||
            right.id.localeCompare(left.id),
        )
        .map((fixture) => fixture.slug);
    const expectedLatest = fixtures
      .slice()
      .sort(
        (left, right) =>
          (right.releaseAt ?? 0) - (left.releaseAt ?? 0) || right.id.localeCompare(left.id),
      )
      .map((fixture) => fixture.slug);

    await expect(
      collectMarketplaceSlugs(db, { ...query, sort: "stars" }, fixtures.length),
    ).resolves.toEqual(byMetric("stars"));
    await expect(
      collectMarketplaceSlugs(db, { ...query, sort: "downloads" }, fixtures.length),
    ).resolves.toEqual(byMetric("downloads"));
    await expect(
      collectMarketplaceSlugs(db, { ...query, sort: "latest" }, fixtures.length),
    ).resolves.toEqual(expectedLatest);

    const allByDownloads = await listCatalogMarketplace(db, {
      ...query,
      sort: "downloads",
      limit: fixtures.length,
    });
    expect(allByDownloads.items.find((item) => item.slug === fixtures[0]!.slug)).toMatchObject({
      downloads: "—",
    });
  });
});
