import { sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import type { SitemapDatabaseRow } from "@/lib/sitemap";

function pluginRows(value?: string) {
  return sql`
    select 'plugin' as kind,l.locale as locale,p.slug as value,
      max(p.updated_at,l.updated_at) as updated_at
    from plugins p
    join plugin_localizations l on l.plugin_id=p.id
    where p.status='published'
      and p.lifecycle_status in ('active','unmaintained')
      ${value ? sql`and p.slug=${value}` : sql``}
      and l.translation_status='ready'
      and length(trim(l.overview_markdown))>0
      and exists(
        select 1 from plugin_install_targets t
        where t.plugin_id=p.id and t.is_primary=1 and t.status='active'
      )
      and exists(
        select 1 from plugin_source_documents d
        where d.plugin_id=p.id and d.kind='readme' and d.availability='available'
      )
  `;
}

function categoryRows(value?: string) {
  return sql`
    select 'category' as kind,cl.locale as locale,c.slug as value,c.updated_at as updated_at
    from categories c
    join category_localizations cl on cl.category_id=c.id
    where c.active=1
      ${value ? sql`and c.slug=${value}` : sql``}
      and length(trim(coalesce(cl.description,'')))>0
      and 3 <= (
        select count(*) from plugin_categories pc
        join plugins p on p.id=pc.plugin_id
        join plugin_localizations pl on pl.plugin_id=p.id and pl.locale=cl.locale
        where pc.category_id=c.id and p.status='published'
          and p.lifecycle_status in ('active','unmaintained')
          and pl.translation_status='ready'
      )
  `;
}

function publisherRows(value?: string) {
  return sql`
    select 'publisher' as kind,pl.locale as locale,p.login as value,
      max(p.updated_at,pl.updated_at) as updated_at
    from publishers p
    join publisher_localizations pl on pl.publisher_id=p.id
    where pl.status='ready'
      ${value ? sql`and p.login=${value}` : sql``}
      and exists(
        select 1 from plugins plugin
        join plugin_localizations plugin_l
          on plugin_l.plugin_id=plugin.id and plugin_l.locale=pl.locale
        where plugin.publisher_id=p.id and plugin.status='published'
          and plugin.lifecycle_status in ('active','unmaintained')
          and plugin_l.translation_status='ready'
      )
  `;
}

function changelogRows(value?: string) {
  return sql`
    select 'changelog' as kind,l.locale as locale,c.slug as value,c.updated_at as updated_at
    from changelog_entries c
    cross join (select 'en' as locale union all select 'zh' as locale) l
    where c.status='published' and c.published_at<=date('now')
      ${value ? sql`and c.slug=${value}` : sql``}
  `;
}

export function listSitemapDatabaseRows(db: Database): Promise<SitemapDatabaseRow[]> {
  return db.all<SitemapDatabaseRow>(sql`
    ${pluginRows()}
    union all
    ${categoryRows()}
    union all
    ${publisherRows()}
    union all
    ${changelogRows()}
    order by kind,locale,value
  `);
}

export async function listIndexableSitemapLocales(
  db: Database,
  kind: SitemapDatabaseRow["kind"],
  value: string,
): Promise<Array<"en" | "zh">> {
  const query =
    kind === "changelog"
      ? changelogRows(value)
      : kind === "plugin"
        ? pluginRows(value)
        : kind === "category"
          ? categoryRows(value)
          : publisherRows(value);
  const rows = await db.all<Pick<SitemapDatabaseRow, "locale">>(query);
  return rows.map((row) => row.locale);
}
