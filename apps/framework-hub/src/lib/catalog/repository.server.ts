import { sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import type { MarketplaceListQuery, PluginListQuery } from "./contracts";
import type { CatalogCard } from "./types";

export type { CatalogCard } from "./types";

type ListRow = {
  id: string;
  slug: string;
  package_name: string;
  name: string;
  description: string;
  author_handle: string;
  latest_version: string;
  compatibility_range: string;
  category: string;
  badge: CatalogCard["badge"];
  featured: number;
  latest_published_at: number | null;
  updated_at: number;
  github_stars: number | null;
  npm_downloads_week: number | null;
  trend_score_7d: number | null;
  publisher_login: string | null;
  publisher_avatar_url: string | null;
  icon_media_id: string | null;
};

function formatDownloads(value: number | null): string {
  if (value === null) return "—";
  const count = value;
  return count >= 1_000 ? `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count);
}

function toCard(row: ListRow): CatalogCard {
  return {
    slug: row.slug,
    name: row.name,
    scope: row.package_name,
    description: row.description,
    author: row.author_handle,
    version: row.latest_version,
    compat: row.compatibility_range,
    publishedAt:
      row.latest_published_at === null ? null : new Date(row.latest_published_at).toISOString(),
    updated: new Date(row.updated_at).toISOString().slice(0, 10),
    category: row.category,
    stars: row.github_stars,
    downloads: formatDownloads(row.npm_downloads_week),
    badge: row.badge,
    glyph: row.name.slice(0, 1).toUpperCase(),
    iconUrl: row.icon_media_id ? `/api/media/${encodeURIComponent(row.icon_media_id)}` : null,
    publisher: {
      login: row.publisher_login ?? row.author_handle,
      avatarUrl: row.publisher_avatar_url,
    },
    featured: row.featured === 1,
    trending: (row.trend_score_7d ?? 0) > 0,
    isNew:
      row.latest_published_at !== null && Date.now() - row.latest_published_at < 30 * 86_400_000,
  };
}

function encodeCursor(primary: number, updatedAt: number, id: string): string {
  return btoa(JSON.stringify([primary, updatedAt, id]))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeCursor(value?: string | null): [number, number, string] | null {
  if (!value) return null;
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const parsed = JSON.parse(atob(normalized)) as unknown;
    return Array.isArray(parsed) &&
      typeof parsed[0] === "number" &&
      typeof parsed[1] === "number" &&
      typeof parsed[2] === "string"
      ? [parsed[0], parsed[1], parsed[2]]
      : null;
  } catch {
    return null;
  }
}

const marketplaceEligibility = sql`p.verification_status = 'verified'
  and (select count(*) from plugin_install_targets primary_target
       where primary_target.plugin_id = p.id
         and primary_target.is_primary = 1
         and primary_target.status = 'active') = 1
  and exists(select 1 from plugin_install_targets install_target
             where install_target.plugin_id = p.id
               and install_target.is_primary = 1
               and install_target.status = 'active'
               and install_target.package_name = p.package_name
               and install_target.version = p.latest_version
               and (
                 (install_target.kind = 'npm'
                  and install_target.spec = (p.package_name || '@' || p.latest_version))
                 or
                 (install_target.kind = 'github'
                  and (select count(*) from plugin_releases exact_release
                       where exact_release.plugin_id = p.id
                         and exact_release.version = p.latest_version
                         and exact_release.channel = 'stable'
                         and exact_release.git_tag is not null
                         and trim(exact_release.git_tag) != '') = 1
                  and exists(select 1 from repositories exact_repository
                             where exact_repository.id = p.primary_repository_id)
                  and install_target.spec = (
                    'github:' ||
                    (select exact_repository.full_name from repositories exact_repository
                     where exact_repository.id = p.primary_repository_id) ||
                    '#' ||
                    (select exact_release.git_tag from plugin_releases exact_release
                     where exact_release.plugin_id = p.id
                       and exact_release.version = p.latest_version
                       and exact_release.channel = 'stable')
                  ))
               ))`;

const latestPublishedAt = sql`coalesce(
  (select release.published_at from plugin_releases release
   where release.plugin_id = p.id and release.version = p.latest_version
   order by release.published_at desc limit 1),
  p.published_at
)`;

async function listCatalogPluginPage(
  db: Database,
  query: PluginListQuery | MarketplaceListQuery,
  marketplaceOnly: boolean,
) {
  const cursor = decodeCursor(query.cursor);
  const search = query.q.trim();
  const primarySort =
    query.sort === "stars"
      ? sql`coalesce(m.github_stars, 0)`
      : query.sort === "downloads"
        ? sql`coalesce(m.npm_downloads_week, 0)`
        : query.sort === "latest"
          ? sql`coalesce(${latestPublishedAt}, 0)`
          : query.sort === "trending"
            ? sql`coalesce(m.trend_score_7d, 0)`
            : query.sort === "featured"
              ? sql`p.featured`
              : sql`p.updated_at`;
  const secondarySort = query.sort === "latest" ? sql`cast(0 as integer)` : sql`p.updated_at`;
  const conditions = [
    sql`p.status = 'published'`,
    sql`p.lifecycle_status in ('active', 'unmaintained')`,
  ];
  if (marketplaceOnly) conditions.push(marketplaceEligibility);
  if (query.category)
    conditions.push(sql`exists(
      select 1 from plugin_categories category_membership
      join categories category on category.id = category_membership.category_id
      where category_membership.plugin_id = p.id
        and category.slug = ${query.category}
    )`);
  if (cursor)
    conditions.push(
      sql`(${primarySort} < ${cursor[0]} or (${primarySort} = ${cursor[0]} and (${secondarySort} < ${cursor[1]} or (${secondarySort} = ${cursor[1]} and p.id < ${cursor[2]}))))`,
    );
  if (search) {
    const searchExpression = `"${search.replaceAll('"', '""')}"`;
    conditions.push(
      sql`p.id in (select plugin_id from plugin_search where plugin_search match ${searchExpression} and locale = ${query.locale})`,
    );
  }
  const order = sql`${primarySort} desc, ${secondarySort} desc, p.id desc`;
  const rows = await db.all<ListRow>(sql`
    select p.id, p.slug, p.package_name,
      coalesce(case when requested.translation_status = 'ready' then requested.display_name end,
               case when fallback.translation_status = 'ready' then fallback.display_name end, p.name) as name,
      coalesce(case when requested.translation_status = 'ready' then requested.short_description end,
               case when fallback.translation_status = 'ready' then fallback.short_description end, p.description) as description,
      p.author_handle, p.latest_version, p.compatibility_range, p.category, p.badge,
      p.featured, ${latestPublishedAt} latest_published_at, p.updated_at,
      m.github_stars, m.npm_downloads_week, m.trend_score_7d,
      pub.login publisher_login, pub.avatar_url publisher_avatar_url,
      (select pm.id from plugin_media pm
       where pm.plugin_id=p.id and pm.kind='icon' and pm.status='active'
       order by pm.sort_order,pm.created_at limit 1) icon_media_id
    from plugins p
    left join publishers pub on pub.id = p.publisher_id
    left join plugin_localizations requested on requested.plugin_id = p.id and requested.locale = ${query.locale}
    left join plugin_localizations fallback on fallback.plugin_id = p.id and fallback.locale = case when ${query.locale} = 'en' then 'zh' else 'en' end
    left join plugin_metrics_current m on m.plugin_id = p.id
    where ${sql.join(conditions, sql` and `)}
    order by ${order}
    limit ${query.limit + 1}
  `);
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(toCard),
    nextCursor:
      hasMore && last
        ? encodeCursor(
            query.sort === "stars"
              ? (last.github_stars ?? 0)
              : query.sort === "downloads"
                ? (last.npm_downloads_week ?? 0)
                : query.sort === "latest"
                  ? (last.latest_published_at ?? 0)
                  : query.sort === "trending"
                    ? (last.trend_score_7d ?? 0)
                    : query.sort === "featured"
                      ? last.featured
                      : last.updated_at,
            query.sort === "latest" ? 0 : last.updated_at,
            last.id,
          )
        : null,
  };
}

/** Discovery/SEO catalog. Published placeholders intentionally remain visible here. */
export function listCatalogPlugins(db: Database, query: PluginListQuery) {
  return listCatalogPluginPage(db, query, false);
}

type DetailRow = ListRow & {
  identity_key: string;
  lifecycle_status: string;
  license_spdx: string | null;
  homepage_url: string | null;
  repository_url: string | null;
  overview_markdown: string | null;
  install_notes_markdown: string | null;
  seo_title: string | null;
  seo_description: string | null;
  translation_status: string | null;
  review_count: number | null;
  rating_sum: number | null;
};

type InstallTargetRow = {
  kind: string;
  spec: string;
  package_name: string;
  version: string;
  integrity: string | null;
  is_primary: number;
  status: string;
};
type ReleaseRow = {
  version: string;
  channel: string;
  git_tag: string | null;
  compatibility_range: string | null;
  release_notes_url: string | null;
  deprecated: number;
  published_at: number | null;
};
type DependencyRow = { package_name: string; version_range: string; kind: string };
type LinkRow = { kind: string; url: string; label: string | null };
type CategoryRow = { slug: string; name: string | null; is_primary: number };
type CapabilityRow = { kind: string; identifier: string; metadata_json: string | null };
type MediaRow = {
  id: string;
  kind: string;
  content_type: string;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  caption: string | null;
};

export async function getCatalogPlugin(db: Database, slug: string, locale: "en" | "zh") {
  const aliases = await db.all<{ slug: string }>(sql`
    select p.slug from plugin_aliases a join plugins p on p.id = a.plugin_id
    where a.kind = 'slug' and a.value = ${slug} limit 1
  `);
  const canonicalSlug = aliases[0]?.slug ?? slug;
  const rows = await db.all<DetailRow>(sql`
    select p.*, ${latestPublishedAt} latest_published_at,
      coalesce(requested.display_name, fallback.display_name, p.name) as name,
      coalesce(requested.short_description, fallback.short_description, p.description) as description,
      coalesce(requested.overview_markdown, fallback.overview_markdown) as overview_markdown,
      coalesce(requested.install_notes_markdown, fallback.install_notes_markdown) as install_notes_markdown,
      requested.seo_title, requested.seo_description, requested.translation_status,
      m.github_stars, m.npm_downloads_week, m.trend_score_7d, m.review_count, m.rating_sum,
      pub.login publisher_login, pub.avatar_url publisher_avatar_url,
      (select pm.id from plugin_media pm
       where pm.plugin_id=p.id and pm.kind='icon' and pm.status='active'
       order by pm.sort_order,pm.created_at limit 1) icon_media_id
    from plugins p
    left join publishers pub on pub.id = p.publisher_id
    left join plugin_localizations requested on requested.plugin_id = p.id and requested.locale = ${locale}
    left join plugin_localizations fallback on fallback.plugin_id = p.id and fallback.locale = case when ${locale} = 'en' then 'zh' else 'en' end and fallback.translation_status = 'ready'
    left join plugin_metrics_current m on m.plugin_id = p.id
    where p.slug = ${canonicalSlug} and p.status = 'published' limit 1
  `);
  const row = rows[0];
  if (!row) return null;
  const [
    targets,
    releases,
    dependencies,
    links,
    categories,
    capabilities,
    media,
    localeStates,
    related,
  ] = await Promise.all([
    db.all<InstallTargetRow>(
      sql`select kind, spec, package_name, version, integrity, is_primary, status from plugin_install_targets where plugin_id = ${row.id} order by is_primary desc`,
    ),
    db.all<ReleaseRow>(
      sql`select version, channel, git_tag, compatibility_range, release_notes_url, deprecated, published_at from plugin_releases where plugin_id = ${row.id} order by published_at desc limit 20`,
    ),
    db.all<DependencyRow>(
      sql`select d.package_name, d.version_range, d.kind from plugin_dependencies d join plugin_releases r on r.id = d.release_id where r.plugin_id = ${row.id} and r.version = ${row.latest_version}`,
    ),
    db.all<LinkRow>(
      sql`select kind, url, label from plugin_links where plugin_id = ${row.id} order by sort_order`,
    ),
    db.all<CategoryRow>(
      sql`select c.slug, cl.name, pc.is_primary from plugin_categories pc join categories c on c.id = pc.category_id left join category_localizations cl on cl.category_id = c.id and cl.locale = ${locale} where pc.plugin_id = ${row.id} order by pc.is_primary desc, pc.sort_order`,
    ),
    db.all<CapabilityRow>(
      sql`select kind, identifier, metadata_json from plugin_capabilities where plugin_id = ${row.id}`,
    ),
    db.all<MediaRow>(
      sql`select pm.id, pm.kind, pm.content_type, pm.width, pm.height, pml.alt_text, pml.caption from plugin_media pm left join plugin_media_localizations pml on pml.media_id = pm.id and pml.locale = ${locale} where pm.plugin_id = ${row.id} and pm.status = 'active' order by pm.sort_order`,
    ),
    db.all<{ locale: string; translation_status: string }>(
      sql`select locale, translation_status from plugin_localizations where plugin_id = ${row.id}`,
    ),
    db.all<ListRow>(
      sql`select p.id, p.slug, p.package_name, p.name, p.description, p.author_handle,
        p.latest_version, p.compatibility_range, p.category, p.badge, p.featured,
        ${latestPublishedAt} latest_published_at, p.updated_at,
        m.github_stars, m.npm_downloads_week, m.trend_score_7d,
        pub.login publisher_login, pub.avatar_url publisher_avatar_url,
        (select pm.id from plugin_media pm
         where pm.plugin_id=p.id and pm.kind='icon' and pm.status='active'
         order by pm.sort_order,pm.created_at limit 1) icon_media_id
       from plugins p
       left join publishers pub on pub.id=p.publisher_id
       left join plugin_metrics_current m on m.plugin_id=p.id
       where p.id != ${row.id} and p.status='published'
         and p.lifecycle_status in ('active','unmaintained') and p.category=${row.category}
       order by p.featured desc, p.updated_at desc limit 3`,
    ),
  ]);
  const ready = new Set(
    localeStates
      .filter((state) => state.translation_status === "ready")
      .map((state) => state.locale),
  );
  const reviewCount = row.review_count ?? 0;
  return {
    plugin: toCard(row),
    id: row.id,
    identityKey: row.identity_key,
    lifecycleStatus: row.lifecycle_status,
    license: row.license_spdx,
    homepageUrl: row.homepage_url,
    repositoryUrl: row.repository_url,
    overviewMarkdown: row.overview_markdown,
    installNotesMarkdown: row.install_notes_markdown,
    seoTitle: row.seo_title ?? row.name,
    seoDescription: row.seo_description ?? row.description,
    indexable: ready.has(locale) && row.lifecycle_status !== "unavailable",
    readyLocales: [...ready],
    redirectSlug: canonicalSlug !== slug ? canonicalSlug : null,
    installTargets: targets,
    releases,
    dependencies,
    links,
    categories,
    capabilities,
    media,
    rating:
      reviewCount >= 1
        ? { count: reviewCount, average: (row.rating_sum ?? 0) / reviewCount }
        : null,
    related: related.map(toCard),
  };
}

export async function listCatalogCategories(db: Database, locale: "en" | "zh") {
  return db.all<{ slug: string; name: string }>(sql`
    select c.slug, coalesce(cl.name, c.slug) as name from categories c
    left join category_localizations cl on cl.category_id=c.id and cl.locale=${locale}
    where c.active=1 order by c.sort_order
  `);
}

/** Discovery response, extended additively without changing its existing page fields. */
export async function listCatalogDiscovery(db: Database, query: PluginListQuery) {
  const [page, categories] = await Promise.all([
    listCatalogPlugins(db, query),
    listCatalogCategories(db, query.locale),
  ]);
  return { ...page, categories };
}

/** Installable marketplace response. Only one exact, active primary target is accepted. */
export async function listCatalogMarketplace(db: Database, query: MarketplaceListQuery) {
  const [page, categories] = await Promise.all([
    listCatalogPluginPage(db, query, true),
    listCatalogCategories(db, query.locale),
  ]);
  return { ...page, categories };
}

export async function getCatalogMarketplacePlugin(db: Database, slug: string, locale: "en" | "zh") {
  const detail = await getCatalogPlugin(db, slug, locale);
  if (!detail) return null;
  const eligible = await db.get<{ eligible: number }>(sql`
    select case when
      p.status = 'published'
      and p.lifecycle_status in ('active', 'unmaintained')
      and ${marketplaceEligibility}
      then 1 else 0 end eligible
    from plugins p where p.id = ${detail.id}
  `);
  return eligible?.eligible === 1 ? detail : null;
}
