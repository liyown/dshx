import { eq, inArray, sql } from "drizzle-orm";

import type { CatalogCard } from "@/lib/catalog/types";
import { listCatalogCardsBySlugs } from "@/lib/catalog/repository.server";
import { OperationHttpError } from "@/lib/catalog/operations-v1.http";
import type { Database } from "@/lib/db/client";
import { categories, featuredPluginPicks, plugins } from "@/lib/db/schema";

export type FeaturedSection = {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly plugins: readonly CatalogCard[];
};

export type FeaturedOperationPlugin = {
  readonly slug: string;
  readonly name: string;
  readonly status: string;
  readonly lifecycleStatus: string;
  readonly sortOrder: number;
};

export type FeaturedOperationCategory = {
  readonly slug: string;
  readonly active: boolean;
  readonly name: Readonly<Record<"en" | "zh", string>>;
  readonly description: Readonly<Record<"en" | "zh", string | null>>;
  readonly plugins: readonly FeaturedOperationPlugin[];
};

const publishablePlugin = sql`p.status = 'published' and p.lifecycle_status in ('active', 'unmaintained')`;

export async function listFeaturedSections(
  db: Database,
  locale: "en" | "zh",
): Promise<FeaturedSection[]> {
  const sections = await db.all<{
    slug: string;
    name: string;
    description: string | null;
  }>(sql`
    select c.slug,
      coalesce(localized.name, fallback.name, c.slug) as name,
      coalesce(localized.description, fallback.description) as description
    from categories c
    left join category_localizations localized
      on localized.category_id = c.id and localized.locale = ${locale}
    left join category_localizations fallback
      on fallback.category_id = c.id and fallback.locale = case when ${locale} = 'en' then 'zh' else 'en' end
    where c.active = 1
      and exists(
        select 1 from featured_plugin_picks pick
        join plugins p on p.id = pick.plugin_id
        where pick.category_id = c.id and ${publishablePlugin}
      )
    order by c.sort_order, c.slug
  `);
  if (sections.length === 0) return [];
  const picks = await db.all<{ category_slug: string; plugin_slug: string }>(sql`
    select c.slug as category_slug, p.slug as plugin_slug
    from featured_plugin_picks pick
    join categories c on c.id = pick.category_id and c.active = 1
    join plugins p on p.id = pick.plugin_id
    where ${publishablePlugin}
    order by c.sort_order, c.slug, pick.sort_order, p.slug
  `);
  const cards = await listCatalogCardsBySlugs(
    db,
    picks.map((pick) => pick.plugin_slug),
    locale,
  );
  const bySlug = new Map(cards.map((card) => [card.slug, card]));
  return sections.flatMap((section) => {
    const sectionPlugins = picks
      .filter((pick) => pick.category_slug === section.slug)
      .flatMap((pick) => {
        const card = bySlug.get(pick.plugin_slug);
        return card ? [card] : [];
      });
    return sectionPlugins.length > 0 ? [{ ...section, plugins: sectionPlugins }] : [];
  });
}

type FeaturedOperationPick = FeaturedOperationPlugin & { categoryId: string };

async function operationPlugins(db: Database): Promise<FeaturedOperationPick[]> {
  return db.all<FeaturedOperationPick>(sql`
    select pick.category_id as categoryId, p.slug, p.name, p.status,
      p.lifecycle_status as lifecycleStatus, pick.sort_order as sortOrder
    from featured_plugin_picks pick
    join plugins p on p.id = pick.plugin_id
    order by pick.sort_order, p.slug
  `);
}

export async function getFeaturedForOperations(
  db: Database,
): Promise<{ items: FeaturedOperationCategory[] }> {
  const rows = await db.all<{
    id: string;
    slug: string;
    active: boolean;
    nameEn: string;
    nameZh: string;
    descriptionEn: string | null;
    descriptionZh: string | null;
  }>(sql`
    select c.id, c.slug, c.active,
      coalesce(en.name, zh.name, c.slug) as nameEn,
      coalesce(zh.name, en.name, c.slug) as nameZh,
      en.description as descriptionEn, zh.description as descriptionZh
    from categories c
    left join category_localizations en on en.category_id = c.id and en.locale = 'en'
    left join category_localizations zh on zh.category_id = c.id and zh.locale = 'zh'
    where exists(select 1 from featured_plugin_picks pick where pick.category_id = c.id)
    order by c.sort_order, c.slug
  `);
  if (rows.length === 0) return { items: [] };
  const picks = await operationPlugins(db);
  return {
    items: rows.map((row) => ({
      slug: row.slug,
      active: row.active,
      name: { en: row.nameEn, zh: row.nameZh },
      description: { en: row.descriptionEn, zh: row.descriptionZh },
      plugins: picks
        .filter((pick) => pick.categoryId === row.id)
        .map((pick) => ({
          slug: pick.slug,
          name: pick.name,
          status: pick.status,
          lifecycleStatus: pick.lifecycleStatus,
          sortOrder: pick.sortOrder,
        })),
    })),
  };
}

export async function replaceFeaturedPicks(
  db: Database,
  categorySlug: string,
  pluginSlugs: readonly string[],
): Promise<FeaturedOperationCategory> {
  const [category] = await db
    .select({ id: categories.id, slug: categories.slug, active: categories.active })
    .from(categories)
    .where(eq(categories.slug, categorySlug))
    .limit(1);
  if (!category)
    throw new OperationHttpError(404, "featured_category_not_found", "Featured category not found");
  let ids: Array<{ id: string; slug: string }> = [];
  if (pluginSlugs.length > 0) {
    ids = await db
      .select({ id: plugins.id, slug: plugins.slug })
      .from(plugins)
      .where(inArray(plugins.slug, [...pluginSlugs]));
    const found = new Set(ids.map((row) => row.slug));
    const missing = pluginSlugs.filter((slug) => !found.has(slug));
    if (missing.length > 0)
      throw new OperationHttpError(
        422,
        "featured_plugin_not_found",
        "One or more featured plugins do not exist.",
        false,
        { path: "pluginSlugs", details: { missing } },
      );
  }
  const bySlug = new Map(ids.map((row) => [row.slug, row.id]));
  const previous =
    pluginSlugs.length === 0
      ? (await getFeaturedForOperations(db)).items.find((item) => item.slug === category.slug)
      : undefined;
  const replacements = pluginSlugs.map((slug, index) => ({
    categoryId: category.id,
    pluginId: bySlug.get(slug) as string,
    sortOrder: index,
    updatedAt: new Date(),
  }));
  await db.batch([
    db.delete(featuredPluginPicks).where(eq(featuredPluginPicks.categoryId, category.id)),
    ...(replacements.length > 0
      ? [
          db
            .insert(featuredPluginPicks)
            .values(replacements)
            .onConflictDoUpdate({
              target: [featuredPluginPicks.categoryId, featuredPluginPicks.pluginId],
              set: { sortOrder: sql`excluded.sort_order`, updatedAt: new Date() },
            }),
        ]
      : []),
  ]);
  const result = await getFeaturedForOperations(db);
  const updated = result.items.find((item) => item.slug === category.slug);
  if (updated) return updated;
  if (pluginSlugs.length === 0) {
    // A cleared shelf intentionally disappears from the operations list. Give
    // the caller the previous localized entry with an empty pick list instead
    // of treating a successful clear as a failed write.
    return (
      (previous && { ...previous, plugins: [] }) ?? {
        slug: category.slug,
        active: category.active,
        name: { en: category.slug, zh: category.slug },
        description: { en: null, zh: null },
        plugins: [],
      }
    );
  }
  throw new OperationHttpError(
    500,
    "featured_write_failed",
    "Featured picks were saved but could not be read back.",
    true,
  );
}
