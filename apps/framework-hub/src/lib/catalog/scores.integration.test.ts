import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { createDatabase, type Database } from "@/lib/db/client";
import { categories, pluginCategories, pluginMetricsCurrent, plugins } from "@/lib/db/schema";
import { listCatalogDiscovery } from "./repository.server";
import { refreshPluginScore, refreshPluginScores } from "./scores.server";

type Fixture = {
  id: string;
  slug: string;
  packageName: string;
  stars: number;
  downloads: number;
  publishedAt: Date;
};

function randomSuffix() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

async function insertPlugin(
  db: Database,
  input: {
    suffix: string;
    label: string;
    category: string;
    status?: "published" | "draft";
    stars?: number;
    downloads?: number;
    publishedAt?: Date;
  },
): Promise<Fixture> {
  const id = crypto.randomUUID();
  const packageName = `@score-fixture/${input.label}-${input.suffix}`;
  const publishedAt = input.publishedAt ?? new Date();
  await db.insert(plugins).values({
    id,
    slug: `${input.label}-${input.suffix}`,
    packageName,
    identityKey: `npm:${packageName}`,
    name: `Score fixture ${input.label} ${input.suffix}`,
    description: `Score fixture ${input.label}.`,
    latestVersion: "1.0.0",
    authorHandle: `fixture-${input.suffix}`,
    category: input.category,
    compatibilityRange: ">=0.2.1-rc.2 <0.3.0-0",
    verificationStatus: "verified",
    lifecycleStatus: "active",
    status: input.status ?? "published",
    publishedAt,
    lastSyncedAt: new Date(),
  });
  if (input.stars !== undefined || input.downloads !== undefined) {
    await db.insert(pluginMetricsCurrent).values({
      pluginId: id,
      githubStars: input.stars ?? 0,
      npmDownloadsWeek: input.downloads ?? 0,
    });
  }
  return {
    id,
    slug: `${input.label}-${input.suffix}`,
    packageName,
    stars: input.stars ?? 0,
    downloads: input.downloads ?? 0,
    publishedAt,
  };
}

async function queryCatalog(db: Database, category: string) {
  return listCatalogDiscovery(db, {
    locale: "en",
    q: "",
    category,
    sort: "featured",
    limit: 24,
  } as never);
}

describe("catalog score cache", () => {
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

  it("stores one row per published plugin and skips drafts", async () => {
    const suffix = randomSuffix();
    const category = `scores-store-${suffix}`;
    const published = await insertPlugin(db, { suffix, label: "stored", category });
    const draft = await insertPlugin(db, {
      suffix,
      label: "draft",
      category,
      status: "draft",
    });

    await refreshPluginScores(db, { pluginIds: [published.id, draft.id] });

    const rows = await db.all<{ plugin_id: string }>(
      sql`select plugin_id from plugin_scores where plugin_id in (${published.id}, ${draft.id})`,
    );
    expect(rows.map((row) => row.plugin_id)).toEqual([published.id]);
  });

  it("keeps the catalog ordering identical with and without stored scores", async () => {
    const suffix = randomSuffix();
    const categoryId = crypto.randomUUID();
    const category = `scores-order-${suffix}`;
    await db.insert(categories).values({ id: categoryId, slug: category });
    const fixtures = [
      await insertPlugin(db, {
        suffix,
        label: "high",
        category,
        stars: 1200,
        downloads: 12_000,
      }),
      await insertPlugin(db, {
        suffix,
        label: "medium",
        category,
        stars: 120,
        downloads: 1_200,
        publishedAt: new Date(Date.now() - 200 * 86_400_000),
      }),
      await insertPlugin(db, { suffix, label: "low", category }),
    ];

    await db.insert(pluginCategories).values(
      fixtures.map((fixture) => ({
        pluginId: fixture.id,
        categoryId,
        isPrimary: true,
      })),
    );
    await refreshPluginScores(db, { pluginIds: fixtures.map((fixture) => fixture.id) });
    const stored = await queryCatalog(db, category);
    expect(stored.items.map((item) => item.slug)).toHaveLength(fixtures.length);
    expect(stored.items[0]?.slug).toBe(fixtures[0]?.slug);

    await db.run(sql`
      delete from plugin_scores
      where plugin_id in (${sql.join(
        fixtures.map((fixture) => sql`${fixture.id}`),
        sql`, `,
      )})
    `);
    const fallback = await queryCatalog(db, category);
    expect(fallback.items.map((item) => item.slug)).toEqual(stored.items.map((item) => item.slug));
    expect(fallback.items.map((item) => item.featured)).toEqual(
      stored.items.map((item) => item.featured),
    );
  });

  it("rewrites only the plugin whose facts changed", async () => {
    const suffix = randomSuffix();
    const category = `scores-single-${suffix}`;
    const first = await insertPlugin(db, { suffix, label: "first", category });
    const second = await insertPlugin(db, { suffix, label: "second", category });
    await refreshPluginScores(db, { pluginIds: [first.id, second.id] });

    await db.insert(pluginMetricsCurrent).values({
      pluginId: first.id,
      githubStars: 5_000,
      npmDownloadsWeek: 50_000,
    });
    await refreshPluginScore(db, first.id);

    const rows = await db.all<{
      plugin_id: string;
      quality_base: number;
      popularity_base: number;
      scored_at: number;
    }>(
      sql`select plugin_id, quality_base, popularity_base, scored_at from plugin_scores
          where plugin_id in (${first.id}, ${second.id}) order by plugin_id`,
    );
    const firstRow = rows.find((row) => row.plugin_id === first.id);
    const secondRow = rows.find((row) => row.plugin_id === second.id);
    expect(firstRow?.popularity_base).toBeGreaterThan(0);
    expect(secondRow?.popularity_base ?? null).toBe(0);
  });
});
