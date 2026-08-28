import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";

import { createDatabase, type Database } from "@/lib/db/client";
import { getCatalogPlugin } from "@/lib/catalog/repository.server";
import { listIndexableSitemapLocales } from "@/lib/sitemap.repository.server";

function fixtureId(prefix: string, suffix: string): string {
  return `${prefix}-${suffix}`;
}

async function insertPlugin(
  db: Database,
  input: { id: string; slug: string; category: string; publisherId?: string },
) {
  await db.run(sql`
    insert into plugins (
      id,slug,identity_key,package_name,name,description,author_handle,category,
      latest_version,compatibility_range,publisher_id,lifecycle_status,status
    ) values (
      ${input.id},${input.slug},${`seo:${input.slug}`},${`@seo-fixture/${input.slug}`},
      ${`SEO ${input.slug}`},${`SEO fixture ${input.slug}`},'seo-fixture',${input.category},
      '1.0.0','*',${input.publisherId ?? null},'active','published'
    )
  `);
}

async function insertPluginLocale(
  db: Database,
  pluginId: string,
  locale: "en" | "zh",
  status: "ready" | "pending",
  overview = "Substantive localized overview.",
) {
  await db.run(sql`
    insert into plugin_localizations (
      plugin_id,locale,display_name,short_description,overview_markdown,highlights_json,
      seo_title,seo_description,source_locale,source_content_hash,translation_status,translator
    ) values (
      ${pluginId},${locale},${`Localized ${pluginId}`},'Localized description',${overview},'[]',
      ${`SEO ${pluginId}`},'Localized SEO description','en',${`hash-${pluginId}-${locale}`},
      ${status},'manual'
    )
  `);
}

describe("sitemap dynamic indexability", () => {
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

  it("uses the same locale eligibility for sitemap rows and dynamic page metadata", async () => {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const categoryId = fixtureId("category", suffix);
    const categorySlug = fixtureId("normalized", suffix);
    await db.run(
      sql`insert into categories (id,slug,active) values (${categoryId},${categorySlug},1)`,
    );
    await db.run(sql`
      insert into category_localizations (category_id,locale,name,description) values
        (${categoryId},'en','English category','Indexable English category'),
        (${categoryId},'zh','中文分类','')
    `);

    for (const index of [1, 2, 3]) {
      const id = fixtureId(`category-plugin-${index}`, suffix);
      await insertPlugin(db, {
        id,
        slug: fixtureId(`category-plugin-${index}`, suffix),
        category: "legacy-projection",
      });
      await insertPluginLocale(db, id, "en", "ready");
      await insertPluginLocale(db, id, "zh", "ready");
      await db.run(sql`
        insert into plugin_categories (plugin_id,category_id,is_primary,sort_order)
        values (${id},${categoryId},${index === 1 ? 1 : 0},${index})
      `);
    }

    expect(await listIndexableSitemapLocales(db, "category", categorySlug)).toEqual(["en"]);

    const publisherId = fixtureId("publisher", suffix);
    const publisherLogin = fixtureId("publisher-login", suffix);
    await db.run(sql`
      insert into publishers (id,github_id,login,kind,profile_url)
      values (${publisherId},${fixtureId("github", suffix)},${publisherLogin},'user',${`https://github.com/${publisherLogin}`})
    `);
    await db.run(sql`
      insert into publisher_localizations (
        publisher_id,locale,display_name,bio,seo_title,seo_description,source_content_hash,status
      ) values
        (${publisherId},'en','English publisher','English bio','Publisher','Publisher description',${`publisher-en-${suffix}`},'ready'),
        (${publisherId},'zh','中文发布者','中文简介','发布者','发布者描述',${`publisher-zh-${suffix}`},'ready')
    `);
    const publisherPluginId = fixtureId("publisher-plugin", suffix);
    await insertPlugin(db, {
      id: publisherPluginId,
      slug: fixtureId("publisher-plugin", suffix),
      category: categorySlug,
      publisherId,
    });
    await insertPluginLocale(db, publisherPluginId, "en", "ready");
    await insertPluginLocale(db, publisherPluginId, "zh", "pending");

    expect(await listIndexableSitemapLocales(db, "publisher", publisherLogin)).toEqual(["en"]);

    const pluginId = fixtureId("quality-plugin", suffix);
    const pluginSlug = fixtureId("quality-plugin", suffix);
    await insertPlugin(db, { id: pluginId, slug: pluginSlug, category: categorySlug });
    await insertPluginLocale(db, pluginId, "en", "ready");
    await insertPluginLocale(db, pluginId, "zh", "ready", "");
    await db.run(sql`
      insert into plugin_install_targets (
        id,plugin_id,kind,spec,package_name,version,is_primary,status,verified_at
      ) values (
        ${fixtureId("target", suffix)},${pluginId},'npm',${`@seo-fixture/${pluginSlug}@1.0.0`},
        ${`@seo-fixture/${pluginSlug}`},'1.0.0',1,'active',${Date.now()}
      )
    `);
    await db.run(sql`
      insert into plugin_source_documents (
        id,plugin_id,kind,availability,format,source_url,content,content_hash,observed_at
      ) values (
        ${fixtureId("source", suffix)},${pluginId},'readme','available','markdown',
        ${`https://github.com/seo-fixture/${pluginSlug}#readme`},'# README',${`source-${suffix}`},${Date.now()}
      )
    `);

    expect(await listIndexableSitemapLocales(db, "plugin", pluginSlug)).toEqual(["en"]);
    await expect(getCatalogPlugin(db, pluginSlug, "en")).resolves.toMatchObject({
      indexable: true,
      readyLocales: ["en"],
    });
    await expect(getCatalogPlugin(db, pluginSlug, "zh")).resolves.toMatchObject({
      indexable: false,
      readyLocales: ["en"],
    });

    await db.run(sql`update plugins set lifecycle_status='unavailable' where id=${pluginId}`);
    expect(await listIndexableSitemapLocales(db, "plugin", pluginSlug)).toEqual([]);
    await expect(getCatalogPlugin(db, pluginSlug, "en")).resolves.toMatchObject({
      indexable: false,
      readyLocales: [],
    });
  });
});
