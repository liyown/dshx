import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { createDatabase, type Database } from "@/lib/db/client";
import {
  apiTokens,
  authUsers,
  categories,
  categoryLocalizations,
  pluginSubmissions,
} from "@/lib/db/schema";

import {
  pluginObservationV1Schema,
  type PluginCurationContent,
  type PluginObservationV1,
} from "./operations-v1.contracts";
import { OperationHttpError } from "./operations-v1.http";
import { uploadOperationMedia } from "./operations-v1.media.server";
import { getCatalogPlugin, listCatalogMarketplace } from "./repository.server";
import {
  curatePlugin,
  expectedObservationId,
  getOpsPlugin,
  getOpsSubmission,
  listOpsPlugins,
  listOpsSubmissions,
  resolveOpsSubmission,
  setPluginVisibility,
  upsertObservation,
  upsertObservationBatch,
} from "./operations-v1.server";

function timestamp(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

async function finalizeObservation(input: Record<string, unknown>): Promise<PluginObservationV1> {
  const parsed = pluginObservationV1Schema.parse({
    schemaVersion: 1,
    observationId: "0".repeat(64),
    ...input,
  });
  return { ...parsed, observationId: await expectedObservationId(parsed) };
}

function curation(label: string, category: string): PluginCurationContent {
  return {
    displayName: { en: `${label} curated`, zh: `${label} 整理版` },
    shortDescription: { en: "Curated English description", zh: "人工整理的中文描述" },
    overviewMarkdown: { en: "## Curated overview", zh: "## 人工整理概览" },
    categories: [category],
    tags: ["fixture"],
    derivedFrom: ["https://example.test/source"],
  };
}

describe("operations v1 atomic catalog model with local D1", () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
  let binding: D1Database;
  let db: Database;
  let actorUserId: string;
  let actorTokenId: string;
  let categorySlug: string;

  beforeAll(async () => {
    proxy = await getPlatformProxy<Env>({
      configPath: "wrangler.jsonc",
      persist: true,
      remoteBindings: false,
    });
    binding = proxy.env.DB;
    db = createDatabase(binding);
    const actorId = crypto.randomUUID();
    actorUserId = actorId;
    actorTokenId = crypto.randomUUID();
    await db.insert(authUsers).values({
      id: actorId,
      name: "Operations test actor",
      email: `${actorId}@example.test`,
    });
    await db.insert(apiTokens).values({
      id: actorTokenId,
      userId: actorId,
      label: "Operations tests",
      tokenPrefix: `test-${actorId.slice(0, 8)}`,
      tokenHash: crypto.randomUUID().replaceAll("-", ""),
      scopesJson: ["catalog:write"],
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const categoryId = crypto.randomUUID();
    categorySlug = `operations-${actorId.slice(0, 8)}`;
    await db.insert(categories).values({ id: categoryId, slug: categorySlug, sortOrder: 999 });
    await db.insert(categoryLocalizations).values([
      { categoryId, locale: "en", name: "Operations fixtures" },
      { categoryId, locale: "zh", name: "运营测试" },
    ]);
  });

  afterAll(async () => proxy.dispose());

  async function npmObservation(
    packageName: string,
    options: {
      observedAt?: string;
      sourceKind?: "npm" | "github" | "readme" | "release" | "manual";
      sourceUrl?: string;
      fingerprint?: string;
      availability?: "available" | "unavailable";
      confirmed?: boolean;
      facts?: Record<string, unknown>;
    } = {},
  ) {
    const fingerprint = options.fingerprint ?? crypto.randomUUID();
    return finalizeObservation({
      observedAt: options.observedAt ?? timestamp(5),
      identity: { kind: "npm", packageName },
      source: {
        kind: options.sourceKind ?? "npm",
        url: options.sourceUrl ?? `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
        contentHash: fingerprint,
        availability: options.availability ?? "available",
      },
      detection: options.confirmed
        ? { signals: [{ kind: "dsh.bundle.patch", value: ".patches[0]" }] }
        : { signals: [{ kind: "readme" }] },
      facts: {
        readme: {
          availability: "unavailable",
          format: "markdown",
          sourceUrl: `https://www.npmjs.com/package/${encodeURIComponent(packageName)}`,
          sourceRef: "fixture",
          path: "README.md",
        },
        ...(options.facts ?? {}),
      },
    });
  }

  async function githubObservation(
    identity: { repositoryId: string; fullName: string; subdirectory: string },
    options: {
      observedAt?: string;
      fingerprint?: string;
      facts?: Record<string, unknown>;
    } = {},
  ) {
    const ownerLogin = identity.fullName.split("/")[0]!;
    return finalizeObservation({
      observedAt: options.observedAt ?? timestamp(5),
      identity: { kind: "github", ...identity },
      source: {
        kind: "github",
        url: `https://github.com/${identity.fullName}`,
        ref: "main",
        contentHash: options.fingerprint ?? crypto.randomUUID(),
        availability: "available",
      },
      detection: { signals: [{ kind: "topic", value: "dshx" }] },
      facts: {
        publisher: {
          githubId: `test-owner:${ownerLogin.toLowerCase()}`,
          login: ownerLogin,
          kind: "user",
          avatarUrl: `https://avatars.githubusercontent.com/${encodeURIComponent(ownerLogin)}`,
          profileUrl: `https://github.com/${ownerLogin}`,
        },
        readme: {
          availability: "unavailable",
          format: "markdown",
          sourceUrl: `https://github.com/${identity.fullName}`,
          sourceRef: "main",
        },
        ...(options.facts ?? {}),
        repository: {
          githubId: identity.repositoryId,
          fullName: identity.fullName,
          ...(options.facts?.["repository"] as Record<string, unknown> | undefined),
        },
      },
    });
  }

  async function pluginId(identityKey: string) {
    const row = await binding
      .prepare("select plugin_id from plugin_observation_identities where identity_key=?")
      .bind(identityKey)
      .first<{ plugin_id: string }>();
    expect(row).toBeTruthy();
    return row!.plugin_id;
  }

  function raceBeforeBatch(id: string): D1Database {
    let raced = false;
    return new Proxy(binding, {
      get(target, property) {
        if (property === "batch")
          return async (statements: D1PreparedStatement[]) => {
            if (!raced) {
              raced = true;
              await binding
                .prepare(
                  "update plugin_operational_state set revision=revision+1,last_operation_id='test-racer' where plugin_id=?",
                )
                .bind(id)
                .run();
            }
            return binding.batch(statements);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as D1Database;
  }

  it("merges targets per source while blocking older high-priority facts and unavailable payloads", async () => {
    const packageName = `@ops/merge-${crypto.randomUUID()}`;
    const githubSpec = `github:example/merge-fixture#${crypto.randomUUID()}`;
    const newer = await npmObservation(packageName, {
      observedAt: timestamp(10),
      sourceKind: "github",
      sourceUrl: "https://github.com/example/merge-fixture",
      facts: {
        package: { name: packageName, version: "2.0.0", description: "newer GitHub fact" },
        installTargets: [
          {
            kind: "github",
            spec: githubSpec,
            packageName,
            version: "2.0.0",
            packagePath: "packages/plugin",
            available: true,
          },
        ],
      },
    });
    await upsertObservation(binding, actorTokenId, crypto.randomUUID(), newer);
    const older = await npmObservation(packageName, {
      observedAt: timestamp(20),
      sourceKind: "npm",
      facts: {
        package: { name: packageName, version: "1.0.0", description: "older npm fact" },
        installTargets: [
          {
            kind: "npm",
            spec: packageName,
            packageName,
            version: "1.0.0",
            available: true,
          },
        ],
      },
    });
    await upsertObservation(binding, actorTokenId, crypto.randomUUID(), older);
    const id = await pluginId(`npm:${packageName}`);
    const beforeUnavailable = await getOpsPlugin(binding, id);
    expect(beforeUnavailable.facts).toMatchObject({
      package: { version: "2.0.0", description: "newer GitHub fact" },
    });
    expect(beforeUnavailable.installTargets).toHaveLength(2);

    const unavailable = await npmObservation(packageName, {
      observedAt: timestamp(1),
      sourceKind: "release",
      sourceUrl: "https://example.test/unavailable-source",
      availability: "unavailable",
      facts: {
        package: { name: packageName, description: "must not project" },
        installTargets: [
          {
            kind: "npm",
            spec: packageName,
            packageName,
            version: "0.0.0",
            available: false,
          },
        ],
      },
    });
    await upsertObservation(binding, actorTokenId, crypto.randomUUID(), unavailable);
    const afterUnavailable = await getOpsPlugin(binding, id);
    expect(afterUnavailable.facts).toEqual(beforeUnavailable.facts);
    expect(afterUnavailable.installTargets).toEqual(beforeUnavailable.installTargets);
    expect(afterUnavailable.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://example.test/unavailable-source",
          availability: "unavailable",
        }),
      ]),
    );
    const publicRow = await binding
      .prepare("select description,last_synced_at lastSyncedAt from plugins where id=?")
      .bind(id)
      .first<{ description: string; lastSyncedAt: number }>();
    expect(publicRow?.description).toBe("newer GitHub fact");
    expect(publicRow?.lastSyncedAt).toBe(Date.parse(newer.observedAt));
  });

  it("prefers a GitHub package manifest over README content at the same observation time", async () => {
    const packageName = `@ops/content-priority-${crypto.randomUUID()}`;
    const observedAt = timestamp(3);
    await upsertObservation(
      binding,
      actorTokenId,
      crypto.randomUUID(),
      await npmObservation(packageName, {
        observedAt,
        sourceKind: "readme",
        sourceUrl: "https://github.com/example/priority/blob/main/README.md",
        facts: { package: { name: packageName, description: "README description" } },
      }),
    );
    const result = await upsertObservation(
      binding,
      actorTokenId,
      crypto.randomUUID(),
      await npmObservation(packageName, {
        observedAt,
        sourceKind: "github",
        sourceUrl: "https://api.github.com/repos/example/priority/contents/package.json",
        facts: { package: { name: packageName, description: "manifest description" } },
      }),
    );
    expect(
      await binding
        .prepare("select description from plugins where id=?")
        .bind(result.pluginId)
        .first(),
    ).toMatchObject({ description: "manifest description" });
  });

  it("publishes fully curated visible plugins without a verification gate and protects curated content", async () => {
    const packageName = `@ops/curated-${crypto.randomUUID()}`;
    const initial = await npmObservation(packageName, {
      observedAt: timestamp(20),
      facts: {
        package: { name: packageName, version: "1.0.0", description: "source description" },
        installTargets: [
          {
            kind: "npm",
            spec: `${packageName}@1.0.0`,
            packageName,
            version: "1.0.0",
            primary: true,
            available: true,
          },
        ],
      },
    });
    const created = await upsertObservation(binding, actorTokenId, crypto.randomUUID(), initial);
    const id = created.pluginId!;
    expect(
      await binding.prepare("select status from plugins where id=?").bind(id).first(),
    ).toMatchObject({ status: "draft" });

    const curated = curation("Protected", categorySlug);
    await curatePlugin(binding, actorTokenId, crypto.randomUUID(), id, curated, created.revision!);
    expect(
      await binding.prepare("select status,description from plugins where id=?").bind(id).first(),
    ).toMatchObject({ status: "published", description: curated.shortDescription.en });
    const marketplaceQuery = {
      locale: "en" as const,
      q: packageName,
      category: "",
      sort: "latest" as const,
      limit: 24,
    };
    expect(
      (await listCatalogMarketplace(db, marketplaceQuery)).items.map((item) => item.scope),
    ).toEqual([packageName]);

    const refresh = await npmObservation(packageName, {
      confirmed: true,
      observedAt: timestamp(5),
      facts: {
        package: { name: packageName, version: "1.1.0", description: "new source description" },
      },
    });
    await upsertObservation(binding, actorTokenId, crypto.randomUUID(), refresh);
    expect(
      await binding.prepare("select status,description from plugins where id=?").bind(id).first(),
    ).toMatchObject({ status: "published", description: curated.shortDescription.en });

    await setPluginVisibility(
      binding,
      actorTokenId,
      crypto.randomUUID(),
      id,
      "hidden",
      "Manual review",
    );
    const hiddenRefresh = await npmObservation(packageName, {
      confirmed: true,
      observedAt: timestamp(1),
      facts: { package: { name: packageName, version: "1.2.0" } },
    });
    await upsertObservation(binding, actorTokenId, crypto.randomUUID(), hiddenRefresh);
    expect(
      await binding.prepare("select status from plugins where id=?").bind(id).first(),
    ).toMatchObject({
      status: "archived",
    });
    expect((await listCatalogMarketplace(db, marketplaceQuery)).items).toEqual([]);
  });

  it("stores the original README and publisher avatar, then reopens content work on README changes", async () => {
    const suffix = crypto.randomUUID();
    const packageName = `@ops/source-profile-${suffix}`;
    const fullName = `source-owner-${suffix}/source-plugin`;
    const repositoryId = crypto.randomUUID();
    const publisherGithubId = `test-owner:source-owner-${suffix}`;
    const sourceUrl = `https://github.com/${fullName}`;
    const firstReadmeHash = "a".repeat(64);
    const created = await upsertObservation(
      binding,
      actorTokenId,
      crypto.randomUUID(),
      await githubObservation(
        { repositoryId, fullName, subdirectory: "" },
        {
          fingerprint: crypto.randomUUID(),
          facts: {
            package: { name: packageName, version: "1.0.0", description: "Source profile" },
            publisher: {
              githubId: publisherGithubId,
              login: `source-owner-${suffix}`,
              kind: "user",
              avatarUrl: `https://avatars.githubusercontent.com/u/${suffix}`,
              profileUrl: `https://github.com/source-owner-${suffix}`,
            },
            readme: {
              availability: "available",
              format: "markdown",
              sourceUrl: `${sourceUrl}/blob/main/README.md`,
              sourceRef: "main",
              path: "README.md",
              content: "# Source plugin\n\nPublishes structured source events.",
              contentHash: firstReadmeHash,
            },
            installTargets: [
              {
                kind: "github",
                spec: `github:${fullName}#main`,
                packageName,
                version: "1.0.0",
                primary: true,
                available: true,
              },
            ],
          },
        },
      ),
    );
    const id = created.pluginId!;
    const curated = {
      ...curation("Source profile", categorySlug),
      sourceReadmeHash: firstReadmeHash,
      derivedFrom: [sourceUrl],
    };
    await curatePlugin(binding, actorTokenId, crypto.randomUUID(), id, curated, created.revision!);

    expect(
      await binding
        .prepare(
          `select p.publisher_id publisherId,pub.avatar_url avatarUrl
           from plugins p left join publishers pub on pub.id=p.publisher_id where p.id=?`,
        )
        .bind(id)
        .first(),
    ).toMatchObject({
      publisherId: `publisher:${publisherGithubId}`,
      avatarUrl: `https://avatars.githubusercontent.com/u/${suffix}`,
    });
    expect(
      await binding
        .prepare(
          `select availability,content,content_hash contentHash
           from plugin_source_documents where plugin_id=? and kind='readme'`,
        )
        .bind(id)
        .first(),
    ).toMatchObject({
      availability: "available",
      content: "# Source plugin\n\nPublishes structured source events.",
      contentHash: firstReadmeHash,
    });
    const publicDetail = await getCatalogPlugin(db, (await getOpsPlugin(binding, id)).slug, "zh");
    expect(publicDetail?.plugin.publisher.avatarUrl).toBe(
      `https://avatars.githubusercontent.com/u/${suffix}`,
    );
    expect(publicDetail?.sourceReadme).toMatchObject({
      sourceRef: "main",
      sourcePath: "README.md",
      contentHash: firstReadmeHash,
    });

    const secondReadmeHash = "b".repeat(64);
    const refreshed = await upsertObservation(
      binding,
      actorTokenId,
      crypto.randomUUID(),
      await githubObservation(
        { repositoryId, fullName, subdirectory: "" },
        {
          observedAt: timestamp(1),
          fingerprint: crypto.randomUUID(),
          facts: {
            package: { name: packageName, version: "1.0.0" },
            readme: {
              availability: "available",
              format: "markdown",
              sourceUrl: `${sourceUrl}/blob/main/README.md`,
              sourceRef: "main",
              path: "README.md",
              content: "# Source plugin\n\nNow also publishes audit events.",
              contentHash: secondReadmeHash,
            },
          },
        },
      ),
    );
    expect((await getOpsPlugin(binding, id)).needs).toContain("content");
    await curatePlugin(
      binding,
      actorTokenId,
      crypto.randomUUID(),
      id,
      { ...curated, sourceReadmeHash: secondReadmeHash },
      refreshed.revision!,
    );
    expect((await getOpsPlugin(binding, id)).needs).not.toContain("content");
  });

  it("makes dry-run validate target conflicts without writing anything", async () => {
    const sharedSpec = `github:example/dry-run#${crypto.randomUUID()}`;
    const firstName = `@ops/dry-a-${crypto.randomUUID()}`;
    const first = await npmObservation(firstName, {
      facts: {
        package: { name: firstName, version: "1.0.0" },
        installTargets: [
          { kind: "github", spec: sharedSpec, packageName: firstName, version: "1.0.0" },
        ],
      },
    });
    await upsertObservation(binding, actorTokenId, crypto.randomUUID(), first);
    const secondName = `@ops/dry-b-${crypto.randomUUID()}`;
    const second = await npmObservation(secondName, {
      facts: {
        package: { name: secondName, version: "1.0.0" },
        installTargets: [
          { kind: "github", spec: sharedSpec, packageName: secondName, version: "1.0.0" },
        ],
      },
    });
    const before = await binding
      .prepare("select count(*) count from plugins where package_name=?")
      .bind(secondName)
      .first<{ count: number }>();
    await expect(
      upsertObservation(binding, actorTokenId, crypto.randomUUID(), second, true),
    ).rejects.toMatchObject({ code: "observation_identity_conflict" });
    const after = await binding
      .prepare("select count(*) count from plugins where package_name=?")
      .bind(secondName)
      .first<{ count: number }>();
    expect(before?.count).toBe(0);
    expect(after?.count).toBe(0);
  });

  it("supports two plugins in one repository and updates a renamed repository identity", async () => {
    const repositoryId = crypto.randomUUID();
    const fullName = `Example-${repositoryId}/Monorepo`;
    const sharedSpec = `github:${fullName}#main`;
    const a = await githubObservation(
      { repositoryId, fullName, subdirectory: "packages/a" },
      {
        observedAt: timestamp(20),
        facts: {
          installTargets: [
            {
              kind: "github",
              spec: sharedSpec,
              packageName: `@ops/a-${repositoryId}`,
              version: "1.0.0",
              packagePath: "packages/a",
            },
          ],
        },
      },
    );
    const b = await githubObservation(
      { repositoryId, fullName, subdirectory: "packages/b" },
      {
        observedAt: timestamp(15),
        facts: {
          installTargets: [
            {
              kind: "github",
              spec: sharedSpec,
              packageName: `@ops/b-${repositoryId}`,
              version: "1.0.0",
              packagePath: "packages/b",
            },
          ],
        },
      },
    );
    const first = await upsertObservation(binding, actorTokenId, crypto.randomUUID(), a);
    const second = await upsertObservation(binding, actorTokenId, crypto.randomUUID(), b);
    expect(second.pluginId).not.toBe(first.pluginId);
    expect((await getOpsPlugin(binding, first.pluginId!)).riskSignals).not.toContain(
      "identity-conflict",
    );
    expect((await getOpsPlugin(binding, second.pluginId!)).riskSignals).not.toContain(
      "identity-conflict",
    );

    const renamedFullName = `Renamed-${repositoryId}/Monorepo`;
    const renamed = await githubObservation(
      { repositoryId, fullName: renamedFullName, subdirectory: "packages/a" },
      { observedAt: timestamp(1) },
    );
    const renameResult = await upsertObservation(
      binding,
      actorTokenId,
      crypto.randomUUID(),
      renamed,
    );
    expect(renameResult.pluginId).toBe(first.pluginId);
    expect((await getOpsPlugin(binding, first.pluginId!)).identities).toEqual(
      expect.arrayContaining([expect.objectContaining({ fullName: renamedFullName })]),
    );
  });

  it("merges npm-first and GitHub identities by an exact package fact", async () => {
    const suffix = crypto.randomUUID();
    const packageName = `@ops/alias-${suffix}`;
    const npm = await npmObservation(packageName, {
      observedAt: timestamp(10),
      facts: { package: { name: packageName, version: "1.0.0" } },
    });
    const npmResult = await upsertObservation(binding, actorTokenId, crypto.randomUUID(), npm);
    const github = await githubObservation(
      {
        repositoryId: suffix,
        fullName: `Example-${suffix}/Alias`,
        subdirectory: "packages/plugin",
      },
      {
        observedAt: timestamp(5),
        facts: { package: { name: packageName, version: "1.0.1" } },
      },
    );
    const githubResult = await upsertObservation(
      binding,
      actorTokenId,
      crypto.randomUUID(),
      github,
    );
    expect(githubResult.pluginId).toBe(npmResult.pluginId);
    expect((await getOpsPlugin(binding, npmResult.pluginId!)).identities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "npm", packageName }),
        expect.objectContaining({
          kind: "github",
          repositoryId: suffix,
          subdirectory: "packages/plugin",
        }),
      ]),
    );
  });

  it("uses hash-suffixed placeholders for distinct long GitHub subdirectories", async () => {
    const repositoryId = crypto.randomUUID();
    const fullName = `Example-${repositoryId}/Long`;
    const prefix = `packages/${"shared-prefix-".repeat(20)}`;
    const first = await githubObservation(
      { repositoryId, fullName, subdirectory: `${prefix}one` },
      { observedAt: timestamp(10) },
    );
    const second = await githubObservation(
      { repositoryId, fullName, subdirectory: `${prefix}two` },
      { observedAt: timestamp(5) },
    );
    const firstResult = await upsertObservation(binding, actorTokenId, crypto.randomUUID(), first);
    const secondResult = await upsertObservation(
      binding,
      actorTokenId,
      crypto.randomUUID(),
      second,
    );
    expect(secondResult.pluginId).not.toBe(firstResult.pluginId);
    const names = await binding
      .prepare("select package_name packageName from plugins where id in (?,?) order by id")
      .bind(firstResult.pluginId, secondResult.pluginId)
      .all<{ packageName: string }>();
    expect(names.results).toHaveLength(2);
    expect(new Set(names.results?.map((row) => row.packageName)).size).toBe(2);
    expect(names.results?.every((row) => row.packageName.length <= 214)).toBe(true);
  });

  it("does not erase normalized repository values when partial facts omit them", async () => {
    const repositoryId = crypto.randomUUID();
    const fullName = `Example-${repositoryId}/Partial`;
    const initial = await githubObservation(
      { repositoryId, fullName, subdirectory: "" },
      {
        observedAt: timestamp(20),
        facts: {
          repository: {
            archived: true,
            disabled: true,
            stars: 91,
            forks: 17,
            openIssues: 4,
            defaultBranch: "develop",
            topics: ["dshx"],
          },
        },
      },
    );
    const created = await upsertObservation(binding, actorTokenId, crypto.randomUUID(), initial);
    await binding
      .prepare(
        `update plugin_operational_state set facts_json=json_object(
          'repository',json_object('githubId',?,'fullName',?)
        ) where plugin_id=?`,
      )
      .bind(repositoryId, fullName, created.pluginId)
      .run();
    const partial = await githubObservation(
      { repositoryId, fullName, subdirectory: "" },
      {
        observedAt: timestamp(1),
        facts: { repository: { description: "partial refresh" } },
      },
    );
    await upsertObservation(binding, actorTokenId, crypto.randomUUID(), partial);
    expect(
      await binding
        .prepare(
          `select is_archived archived,is_disabled disabled,stars,forks,open_issues openIssues,
            default_branch defaultBranch,topics_json topics from repositories where github_id=?`,
        )
        .bind(repositoryId)
        .first(),
    ).toMatchObject({
      archived: 1,
      disabled: 1,
      stars: 91,
      forks: 17,
      openIssues: 4,
      defaultBranch: "develop",
      topics: '["dshx"]',
    });
  });

  it("returns per-item batch results and makes identical concurrent creates idempotent", async () => {
    const packageName = `@ops/batch-${crypto.randomUUID()}`;
    const observation = await npmObservation(packageName, {
      facts: { package: { name: packageName, version: "1.0.0" } },
    });
    const batch = await upsertObservationBatch(
      binding,
      actorTokenId,
      crypto.randomUUID(),
      [observation, { invalid: true }],
      false,
    );
    expect(batch.results.map((result) => result.status)).toEqual(["created", "rejected"]);

    const concurrentName = `@ops/concurrent-${crypto.randomUUID()}`;
    const concurrent = await npmObservation(concurrentName, {
      facts: { package: { name: concurrentName, version: "1.0.0" } },
    });
    const outcomes = await Promise.all([
      upsertObservation(binding, actorTokenId, crypto.randomUUID(), concurrent),
      upsertObservation(binding, actorTokenId, crypto.randomUUID(), concurrent),
    ]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["created", "unchanged"]);
    expect(
      await binding
        .prepare("select count(*) count from plugins where package_name=?")
        .bind(concurrentName)
        .first(),
    ).toMatchObject({ count: 1 });
  });

  it("guards curation, visibility, and media side effects with the winning revision nonce", async () => {
    const packageName = `@ops/race-${crypto.randomUUID()}`;
    const observation = await npmObservation(packageName, {
      confirmed: true,
      facts: { package: { name: packageName, version: "1.0.0" } },
    });
    const created = await upsertObservation(
      binding,
      actorTokenId,
      crypto.randomUUID(),
      observation,
    );
    const id = created.pluginId!;
    await expect(
      curatePlugin(
        raceBeforeBatch(id),
        actorTokenId,
        crypto.randomUUID(),
        id,
        curation("Raced", categorySlug),
        created.revision!,
      ),
    ).rejects.toMatchObject({ code: "revision_conflict" });
    expect(
      await binding
        .prepare("select plugin_id from plugin_curations where plugin_id=?")
        .bind(id)
        .first(),
    ).toBeNull();

    const beforeVisibility = await binding
      .prepare("select status,updated_at updatedAt from plugins where id=?")
      .bind(id)
      .first();
    await expect(
      setPluginVisibility(
        raceBeforeBatch(id),
        actorTokenId,
        crypto.randomUUID(),
        id,
        "hidden",
        "Raced visibility",
      ),
    ).rejects.toMatchObject({ code: "revision_conflict" });
    expect(
      await binding
        .prepare("select status,updated_at updatedAt from plugins where id=?")
        .bind(id)
        .first(),
    ).toEqual(beforeVisibility);

    const png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const file = new File([png], "pixel.png", { type: "image/png" });
    const mediaHash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    await expect(
      uploadOperationMedia(
        raceBeforeBatch(id),
        proxy.env.PLUGIN_MEDIA,
        actorTokenId,
        crypto.randomUUID(),
        id,
        file,
        {
          schemaVersion: 1,
          kind: "icon",
          observedAt: timestamp(1),
          sourceSha256: mediaHash,
          altText: { en: "Pixel", zh: "像素" },
        },
      ),
    ).rejects.toMatchObject({ code: "revision_conflict" });
    expect(
      await binding.prepare("select id from plugin_media where plugin_id=?").bind(id).first(),
    ).toBeNull();
    expect(
      await binding
        .prepare(
          "select count(*) count from plugin_operation_audit where plugin_id=? and action in ('plugin.curate','plugin.hide','media.upload')",
        )
        .bind(id)
        .first(),
    ).toMatchObject({ count: 0 });
  });

  it("deduplicates identical media metadata and revisions metadata changes", async () => {
    const packageName = `@ops/media-${crypto.randomUUID()}`;
    const created = await upsertObservation(
      binding,
      actorTokenId,
      crypto.randomUUID(),
      await npmObservation(packageName, {
        facts: { package: { name: packageName, version: "1.0.0" } },
      }),
    );
    const png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const file = new File([png], "pixel.png", { type: "image/png" });
    const mediaHash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const metadata = {
      schemaVersion: 1 as const,
      kind: "icon" as const,
      observedAt: timestamp(2),
      sourceSha256: mediaHash,
      altText: { en: "Pixel", zh: "像素" },
    };
    const first = await uploadOperationMedia(
      binding,
      proxy.env.PLUGIN_MEDIA,
      actorTokenId,
      crypto.randomUUID(),
      created.pluginId!,
      file,
      metadata,
    );
    const unchanged = await uploadOperationMedia(
      binding,
      proxy.env.PLUGIN_MEDIA,
      actorTokenId,
      crypto.randomUUID(),
      created.pluginId!,
      file,
      metadata,
    );
    const updated = await uploadOperationMedia(
      binding,
      proxy.env.PLUGIN_MEDIA,
      actorTokenId,
      crypto.randomUUID(),
      created.pluginId!,
      file,
      { ...metadata, caption: { en: "Updated caption", zh: "更新说明" } },
    );
    expect(first.status).toBe("created");
    expect(unchanged).toMatchObject({ status: "unchanged", revision: first.revision });
    expect(updated).toMatchObject({ status: "updated", revision: first.revision + 1 });
  });

  it("combines repeated list dimensions with OR within each dimension and AND across them", async () => {
    const page = await listOpsPlugins(binding, {
      state: ["draft", "published"],
      needs: ["content", "metadata"],
      source: ["npm", "github"],
      risk: ["runtime-not-verified", "metadata-incomplete"],
      limit: 100,
    });
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(["draft", "published"]).toContain(item.state);
      expect(item.needs.some((need) => ["content", "metadata"].includes(need))).toBe(true);
      expect(item.sources.some((source) => ["npm", "github"].includes(source.kind))).toBe(true);
      expect(
        item.riskSignals.some((risk) =>
          ["runtime-not-verified", "metadata-incomplete"].includes(risk),
        ),
      ).toBe(true);
    }
  });

  it("lists, reads, and resolves submissions without exposing legacy workflow metadata", async () => {
    const id = crypto.randomUUID();
    await db.insert(pluginSubmissions).values({
      id,
      userId: actorUserId,
      submitterKey: `user:${actorUserId}`,
      repositoryUrl: `https://github.com/example/${id}`,
      repositoryFullName: `example/${id}`,
      status: "queued",
      idempotencyKey: crypto.randomUUID(),
    });
    const listed = await listOpsSubmissions(binding, {
      status: ["queued", "qualified"],
      limit: 10,
    });
    expect(listed.items).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
    const detail = await getOpsSubmission(binding, id);
    expect(detail).not.toHaveProperty("legacyCatalogRunId");
    expect(detail).not.toHaveProperty("catalogRunId");
    const resolution = { result: "ignored" as const, reason: "Not a DSHX plugin" };
    await expect(
      resolveOpsSubmission(binding, actorTokenId, crypto.randomUUID(), id, resolution),
    ).resolves.toMatchObject({ status: "updated", resolution });
    await expect(
      resolveOpsSubmission(binding, actorTokenId, crypto.randomUUID(), id, resolution),
    ).resolves.toMatchObject({ status: "unchanged" });
    await expect(
      resolveOpsSubmission(binding, actorTokenId, crypto.randomUUID(), id, {
        result: "ignored",
        reason: "Different decision",
      }),
    ).rejects.toMatchObject({ code: "submission_resolved" });
  });

  it("refuses to accept a submission until its initial source profile and curation are complete", async () => {
    const suffix = crypto.randomUUID();
    const packageName = `@ops/submission-profile-${suffix}`;
    const observation = await npmObservation(packageName, {
      facts: {
        package: { name: packageName, version: "1.0.0" },
        installTargets: [
          {
            kind: "npm",
            spec: `${packageName}@1.0.0`,
            packageName,
            version: "1.0.0",
            primary: true,
            available: true,
          },
        ],
      },
    });
    const plugin = await upsertObservation(binding, actorTokenId, crypto.randomUUID(), observation);
    const submissionId = crypto.randomUUID();
    await db.insert(pluginSubmissions).values({
      id: submissionId,
      userId: actorUserId,
      submitterKey: `user:${actorUserId}`,
      repositoryUrl: `https://github.com/example/${suffix}`,
      repositoryFullName: `example/${suffix}`,
      status: "queued",
      idempotencyKey: crypto.randomUUID(),
    });
    const resolution = { result: "accepted" as const, pluginId: plugin.pluginId! };
    await expect(
      resolveOpsSubmission(binding, actorTokenId, crypto.randomUUID(), submissionId, resolution),
    ).rejects.toMatchObject({
      code: "submission_plugin_incomplete",
      options: { details: { needs: ["content"] } },
    });
    await curatePlugin(
      binding,
      actorTokenId,
      crypto.randomUUID(),
      plugin.pluginId!,
      curation("Submission profile", categorySlug),
      plugin.revision!,
    );
    await expect(
      resolveOpsSubmission(binding, actorTokenId, crypto.randomUUID(), submissionId, resolution),
    ).resolves.toMatchObject({ status: "updated", resolution });
  });
});
