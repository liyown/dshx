import { sql } from "drizzle-orm";

import { operationReportDaySql } from "@/lib/catalog/operation-report-day";
import {
  OPERATION_REPORT_EARLIER_LIMIT,
  OPERATION_REPORT_INDEX_MIN_CHARS,
} from "@/lib/catalog/operation-report-view";
import type { Database } from "@/lib/db/client";
import type { Locale } from "@/lib/i18n";

/**
 * The public page inventory.
 *
 * Which pages the site offers, and in which locales search engines may index
 * them, used to be answered in three places: the sitemap query, the page head
 * of each detail route, and the Markdown rendition an agent reads. They agreed
 * by inspection, not by construction, so a rule could hold on one surface and
 * not on another — a URL in the sitemap whose own head says `noindex`, or a
 * Markdown document for a page the catalog considers thin.
 *
 * This module is the one answer. The rules live in the queries below, in the
 * same vocabulary the sitemap needs (a set-based listing), and the single-page
 * questions are the same queries narrowed to one value. The sitemap, the page
 * head and the agent document all ask this module; none of them restates a
 * predicate.
 */

export type PublicPageKind =
  "plugin" | "category" | "publisher" | "changelog" | "blog" | "operation-report";

/** A page named the way the catalog names it, before a locale is chosen. */
export type PublicPage = {
  readonly kind: PublicPageKind;
  readonly value: string;
};

/** A public page in one locale, with the last time its content changed. */
export type IndexablePage = PublicPage & {
  readonly locale: Locale;
  readonly updatedAt: number | null;
};

function pluginPages(value?: string) {
  return sql`
    select 'plugin' as kind,l.locale as locale,p.slug as value,
      max(p.updated_at,l.updated_at) as updatedAt
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

function categoryPages(value?: string) {
  return sql`
    select 'category' as kind,cl.locale as locale,c.slug as value,c.updated_at as updatedAt
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

function publisherPages(value?: string) {
  return sql`
    select 'publisher' as kind,pl.locale as locale,p.login as value,
      max(p.updated_at,pl.updated_at) as updatedAt
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

function changelogPages(value?: string) {
  return sql`
    select 'changelog' as kind,l.locale as locale,c.slug as value,c.updated_at as updatedAt
    from changelog_entries c
    cross join (select 'en' as locale union all select 'zh' as locale) l
    where c.status='published' and c.published_at<=date('now')
      ${value ? sql`and c.slug=${value}` : sql``}
  `;
}

function blogPages(value?: string) {
  return sql`
    select 'blog' as kind,l.locale as locale,b.slug as value,b.updated_at as updatedAt
    from blog_posts b
    cross join (select 'en' as locale union all select 'zh' as locale) l
    where b.status='published' and b.published_at<=date('now')
      ${value ? sql`and b.slug=${value}` : sql``}
  `;
}

function operationReportPages(value?: string) {
  // Mirror the public page: a cumulative report hides earlier same-day runs, so
  // only its own body decides indexability. Without the marker, the latest body
  // plus the most recent earlier bodies are visible, and their combined length
  // decides. The earlier list is capped in the page UI.
  return sql`
    with ranked as (
      select ${operationReportDaySql} day,
        completed_at,
        run_id,
        body_en,
        body_zh,
        row_number() over (
          partition by ${operationReportDaySql}
          order by completed_at desc,run_id desc
        ) rn
      from hub_operation_reports
    ),
    days as (
      select day,
        max(completed_at) updatedAt,
        max(case when rn=1 then body_en end) latest_en,
        max(case when rn=1 then body_zh end) latest_zh,
        sum(case when rn<=${OPERATION_REPORT_EARLIER_LIMIT + 1}
          then length(trim(body_en)) else 0 end) body_en_length,
        sum(case when rn<=${OPERATION_REPORT_EARLIER_LIMIT + 1}
          then length(trim(body_zh)) else 0 end) body_zh_length
      from ranked
      group by day
    )
    select 'operation-report' as kind,l.locale as locale,d.day as value,
      d.updatedAt as updatedAt
    from days d
    cross join (select 'en' as locale union all select 'zh' as locale) l
    where (
      (l.locale='en' and (
        case when instr(d.latest_en,'<!-- daily-report:merged -->')>0
          then length(trim(d.latest_en))
          else d.body_en_length
        end
      )>=${OPERATION_REPORT_INDEX_MIN_CHARS})
      or (l.locale='zh' and (
        case when instr(d.latest_zh,'<!-- daily-report:merged -->')>0
          then length(trim(d.latest_zh))
          else d.body_zh_length
        end
      )>=${OPERATION_REPORT_INDEX_MIN_CHARS})
    )
      ${value ? sql`and d.day=${value}` : sql``}
  `;
}

function pagesOf(page: PublicPage) {
  switch (page.kind) {
    case "plugin":
      return pluginPages(page.value);
    case "category":
      return categoryPages(page.value);
    case "publisher":
      return publisherPages(page.value);
    case "changelog":
      return changelogPages(page.value);
    case "blog":
      return blogPages(page.value);
    case "operation-report":
      return operationReportPages(page.value);
  }
}

function comparePages(left: IndexablePage, right: IndexablePage) {
  for (const field of ["kind", "locale", "value"] as const) {
    if (left[field] < right[field]) return -1;
    if (left[field] > right[field]) return 1;
  }
  return 0;
}

/** Every public page the site may be indexed for, in a stable order. */
export async function listIndexablePages(db: Database): Promise<IndexablePage[]> {
  // D1 rejects compound selects with too many terms, so report pages are read
  // separately and merged in the same kind/locale/value order.
  const [rows, reportRows] = await Promise.all([
    db.all<IndexablePage>(sql`
      ${pluginPages()}
      union all
      ${categoryPages()}
      union all
      ${publisherPages()}
      union all
      ${changelogPages()}
      union all
      ${blogPages()}
      order by kind,locale,value
    `),
    db.all<IndexablePage>(operationReportPages()),
  ]);
  return [...rows, ...reportRows].sort(comparePages);
}

/** The locales in which this page is public and may be indexed. */
export async function indexableLocalesFor(db: Database, page: PublicPage): Promise<Locale[]> {
  const rows = await db.all<Pick<IndexablePage, "locale">>(pagesOf(page));
  return rows.map((row) => row.locale);
}

export async function isIndexable(
  db: Database,
  page: PublicPage,
  locale: Locale,
): Promise<boolean> {
  return (await indexableLocalesFor(db, page)).includes(locale);
}
