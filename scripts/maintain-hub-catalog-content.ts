import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

import {
  buildPluginOverview,
  buildPluginSeoDescription,
  buildPluginSeoTitle,
  improveShortDescription,
  isLowInformationCatalogCopy,
  type CatalogLocale,
} from '../apps/framework-hub/src/lib/catalog/content-quality.ts'
import { buildPluginInstallCommand } from '../apps/framework-hub/src/lib/catalog/install-target.ts'
import { curatedZhPluginLeads } from './hub-catalog-zh-curations.ts'

type CatalogRow = {
  id: string
  slug: string
  revision: number
  install_spec: string | null
  has_readme: number
  display_name_json: string
  short_description_json: string
  overview_markdown_json: string
  source_readme_hash: string | null
  categories_json: string
  tags_json: string
  derived_from_json: string
}

type Localized = Record<CatalogLocale, string>

type PreparedPlugin = {
  row: CatalogRow
  displayName: Localized
  shortDescription: Localized
  overviewMarkdown: Localized
  seoTitle: Localized
  seoDescription: Localized
  sourceHash: string
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const workspace = resolve(scriptDirectory, '..')
const hubDirectory = join(workspace, 'apps/framework-hub')
const cliEntrypoint = join(workspace, 'packages/framework-hub-cli/dist/index.js')
const apply = process.argv.includes('--apply')
const onlyCuratedZh = process.argv.includes('--only-curated-zh')
const batchSize = 75
const startedAt = new Date()
const runId = randomUUID()

function run(executable: string, args: string[], options: { cwd?: string; maximumBytes?: number } = {}): string {
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? workspace,
    encoding: 'utf8',
    maxBuffer: options.maximumBytes ?? 64 * 1024 * 1024,
    env: process.env,
  })
  if (result.status !== 0)
    throw new Error([`${executable} ${args.join(' ')} failed with exit code ${String(result.status)}`, result.stdout, result.stderr].filter(Boolean).join('\n'))
  return result.stdout
}

function wrangler(args: string[]): string {
  return run('pnpm', ['exec', 'wrangler', ...args], { cwd: hubDirectory })
}

function query<T>(sql: string): T[] {
  const output = wrangler(['d1', 'execute', 'dshx-framework-hub', '--remote', '--command', sql, '--json'])
  const parsed = JSON.parse(output) as Array<{
    results: T[]
    success: boolean
  }>
  if (!parsed[0]?.success) throw new Error('The production D1 query did not succeed.')
  return parsed[0].results
}

function parseLocalized(value: string, field: string, slug: string): Localized {
  const parsed = JSON.parse(value) as Partial<Localized>
  if (typeof parsed.en !== 'string' || typeof parsed.zh !== 'string') throw new Error(`${slug} has invalid ${field}.`)
  return { en: parsed.en, zh: parsed.zh }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  return value
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function prepare(row: CatalogRow): PreparedPlugin {
  const displayName = parseLocalized(row.display_name_json, 'display names', row.slug)
  const currentDescription = parseLocalized(row.short_description_json, 'short descriptions', row.slug)
  const currentOverview = parseLocalized(row.overview_markdown_json, 'overviews', row.slug)
  const curatedZhLead = curatedZhPluginLeads[row.slug]
  const installCommand = row.install_spec ? buildPluginInstallCommand(row.install_spec) : null
  const shortDescription = Object.fromEntries(
    (['en', 'zh'] as const).map(locale => {
      const preferred = locale === 'zh' && curatedZhLead ? curatedZhLead : currentDescription[locale]
      const overview = locale === 'zh' && curatedZhLead ? curatedZhLead : currentOverview[locale]
      return [locale, improveShortDescription(preferred, overview, locale)]
    }),
  ) as Localized
  const overviewMarkdown = Object.fromEntries(
    (['en', 'zh'] as const).map(locale => [
      locale,
      buildPluginOverview({
        description: shortDescription[locale],
        previousOverview: locale === 'zh' && curatedZhLead ? curatedZhLead : currentOverview[locale],
        installCommand,
        locale,
        hasReadme: row.has_readme === 1,
      }),
    ]),
  ) as Localized
  const seoTitle = Object.fromEntries((['en', 'zh'] as const).map(locale => [locale, buildPluginSeoTitle(displayName[locale], locale)])) as Localized
  const seoDescription = Object.fromEntries(
    (['en', 'zh'] as const).map(locale => [locale, buildPluginSeoDescription(shortDescription[locale], locale)]),
  ) as Localized
  const content = {
    categories: JSON.parse(row.categories_json),
    derivedFrom: JSON.parse(row.derived_from_json),
    displayName,
    overviewMarkdown,
    shortDescription,
    ...(row.source_readme_hash ? { sourceReadmeHash: row.source_readme_hash } : {}),
    tags: JSON.parse(row.tags_json),
  }
  return {
    row,
    displayName,
    shortDescription,
    overviewMarkdown,
    seoTitle,
    seoDescription,
    sourceHash: digest(stableJson(content)),
  }
}

function sqlLiteral(value: string | number | null): string {
  if (value === null) return 'null'
  if (typeof value === 'number') return String(value)
  return `'${value.replaceAll("'", "''")}'`
}

function sqlFor(plugin: PreparedPlugin, now: number): string {
  const { row } = plugin
  const operationId = `${runId}:${row.id}`
  const requestId = runId
  const auditId = randomUUID()
  const guard = `exists(select 1 from plugin_operational_state where plugin_id=${sqlLiteral(row.id)} and last_operation_id=${sqlLiteral(operationId)})`
  const statements = [
    `update plugin_operational_state set revision=revision+1,last_operation_id=${sqlLiteral(operationId)},updated_at=${now} where plugin_id=${sqlLiteral(row.id)} and revision=${row.revision}`,
    `insert into plugin_curations(plugin_id,display_name_json,short_description_json,overview_markdown_json,source_readme_hash,categories_json,tags_json,derived_from_json,updated_at) select ${sqlLiteral(row.id)},${sqlLiteral(stableJson(plugin.displayName))},${sqlLiteral(stableJson(plugin.shortDescription))},${sqlLiteral(stableJson(plugin.overviewMarkdown))},${sqlLiteral(row.source_readme_hash)},${sqlLiteral(row.categories_json)},${sqlLiteral(row.tags_json)},${sqlLiteral(row.derived_from_json)},${now} where ${guard} on conflict(plugin_id) do update set short_description_json=excluded.short_description_json,overview_markdown_json=excluded.overview_markdown_json,updated_at=excluded.updated_at`,
    ...(['en', 'zh'] as const).map(
      locale =>
        `update plugin_localizations set short_description=${sqlLiteral(plugin.shortDescription[locale])},overview_markdown=${sqlLiteral(plugin.overviewMarkdown[locale])},seo_title=${sqlLiteral(plugin.seoTitle[locale])},seo_description=${sqlLiteral(plugin.seoDescription[locale])},source_content_hash=${sqlLiteral(plugin.sourceHash)},translation_status='ready',translator='agent',translated_at=${now},updated_at=${now} where plugin_id=${sqlLiteral(row.id)} and locale=${sqlLiteral(locale)} and ${guard}`,
    ),
    ...(['en', 'zh'] as const).map(
      locale =>
        `update plugin_search set display_name=${sqlLiteral(plugin.displayName[locale])},short_description=${sqlLiteral(plugin.shortDescription[locale])} where plugin_id=${sqlLiteral(row.id)} and locale=${sqlLiteral(locale)} and ${guard}`,
    ),
    `update plugins set name=${sqlLiteral(plugin.displayName.en)},description=${sqlLiteral(plugin.shortDescription.en)},updated_at=${now} where id=${sqlLiteral(row.id)} and ${guard}`,
    `insert into plugin_operation_audit(id,request_id,actor_token_id,action,resource_type,resource_id,plugin_id,before_revision,after_revision,details_json,created_at) select ${sqlLiteral(auditId)},${sqlLiteral(requestId)},null,'catalog.content_maintenance','plugin',${sqlLiteral(row.id)},${sqlLiteral(row.id)},${row.revision},${row.revision + 1},${sqlLiteral(stableJson({ defaultProfile: 'web', fields: ['shortDescription', 'overviewMarkdown', 'seoTitle', 'seoDescription'], runId }))},${now} where ${guard}`,
  ]
  return `${statements.join(';\n')};`
}

function executeBatch(sql: string, index: number, directory: string): void {
  const path = join(directory, `batch-${String(index).padStart(3, '0')}.sql`)
  writeFileSync(path, sql)
  let firstError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      wrangler(['d1', 'execute', 'dshx-framework-hub', '--remote', '--file', path, '--json'])
      return
    } catch (error) {
      firstError ??= error
    }
  }
  throw firstError
}

const rows = query<CatalogRow>(`select
  p.id,p.slug,s.revision,t.spec install_spec,
  case when d.availability='available' and d.content is not null then 1 else 0 end has_readme,
  coalesce(c.display_name_json,json_object('en',en.display_name,'zh',zh.display_name)) display_name_json,
  coalesce(c.short_description_json,json_object('en',en.short_description,'zh',zh.short_description)) short_description_json,
  coalesce(c.overview_markdown_json,json_object('en',en.overview_markdown,'zh',zh.overview_markdown)) overview_markdown_json,
  coalesce(c.source_readme_hash,d.content_hash) source_readme_hash,
  coalesce(c.categories_json,coalesce((select json_group_array(category_slug) from (
    select category.slug category_slug from plugin_categories assignment
    join categories category on category.id=assignment.category_id
    where assignment.plugin_id=p.id order by assignment.is_primary desc,assignment.sort_order
  )),'[]')) categories_json,
  coalesce(c.tags_json,'[]') tags_json,
  coalesce(c.derived_from_json,case
    when d.source_url is not null then json_array(d.source_url)
    when p.repository_url is not null then json_array(p.repository_url)
    when p.homepage_url is not null then json_array(p.homepage_url)
    else '[]' end) derived_from_json
from plugins p
join plugin_operational_state s on s.plugin_id=p.id
join plugin_localizations en on en.plugin_id=p.id and en.locale='en'
join plugin_localizations zh on zh.plugin_id=p.id and zh.locale='zh'
left join plugin_curations c on c.plugin_id=p.id
left join plugin_install_targets t on t.id=(
  select target.id from plugin_install_targets target
  where target.plugin_id=p.id and target.is_primary=1 and target.status='active'
  order by target.updated_at desc limit 1
)
left join plugin_source_documents d on d.plugin_id=p.id and d.kind='readme'
where p.status='published'
order by p.slug`)
const prepared = rows.map(prepare)
const writeSet = onlyCuratedZh ? prepared.filter(plugin => curatedZhPluginLeads[plugin.row.slug]) : prepared
const genericSourceRows = rows.filter(row => {
  const description = parseLocalized(row.short_description_json, 'short descriptions', row.slug)
  const overview = parseLocalized(row.overview_markdown_json, 'overviews', row.slug)
  return isLowInformationCatalogCopy(description.zh) || isLowInformationCatalogCopy(overview.zh)
})
const validation = {
  plugins: prepared.length,
  writeSet: writeSet.length,
  localizations: prepared.length * 2,
  curatedZhLeads: Object.keys(curatedZhPluginLeads).length,
  missingRequiredZhCurations: genericSourceRows.filter(row => !curatedZhPluginLeads[row.slug]).map(row => row.slug),
  withDefaultWebInstall: prepared.filter(plugin => plugin.row.install_spec).length,
  withoutInstallTarget: prepared.filter(plugin => !plugin.row.install_spec).length,
  withReadme: prepared.filter(plugin => plugin.row.has_readme === 1).length,
  placeholderOverviews: prepared.filter(plugin => Object.values(plugin.overviewMarkdown).some(isLowInformationCatalogCopy)).length,
  invalidSeoTitles: prepared.filter(
    plugin => !plugin.seoTitle.en.includes('DeepSeek Harness Plugin | DSHX') || !plugin.seoTitle.zh.includes('DeepSeek Harness 插件 | DSHX'),
  ).length,
  invalidSeoDescriptions: prepared.filter(plugin => plugin.seoDescription.en.length > 160 || plugin.seoDescription.zh.length > 96).length,
  maximumSeoDescriptionLength: {
    en: Math.max(...prepared.map(plugin => plugin.seoDescription.en.length)),
    zh: Math.max(...prepared.map(plugin => plugin.seoDescription.zh.length)),
  },
  invalidSeoDescriptionSamples: prepared
    .filter(plugin => plugin.seoDescription.en.length > 160 || plugin.seoDescription.zh.length > 96)
    .slice(0, 3)
    .map(plugin => ({ slug: plugin.row.slug, value: plugin.seoDescription })),
  oversizedOverviews: prepared.filter(plugin => Object.values(plugin.overviewMarkdown).some(overview => overview.length > 8_000)).length,
}

if (
  validation.plugins === 0 ||
  validation.writeSet === 0 ||
  validation.missingRequiredZhCurations.length > 0 ||
  validation.placeholderOverviews > 0 ||
  validation.invalidSeoTitles > 0 ||
  validation.invalidSeoDescriptions > 0 ||
  validation.oversizedOverviews > 0
)
  throw new Error(`Maintenance validation failed: ${JSON.stringify(validation)}`)

if (!apply) {
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: 'dry-run',
        validation,
        samples: writeSet
          .filter(plugin => plugin.row.slug === 'smelt-ai-dsh-acp-rich' || plugin.row.slug === 'dsh-status-rotator')
          .concat(writeSet.slice(0, 3))
          .slice(0, 5)
          .map(plugin => ({
            slug: plugin.row.slug,
            description: plugin.shortDescription,
            overview: plugin.overviewMarkdown,
            seoTitle: plugin.seoTitle,
            seoDescription: plugin.seoDescription,
          })),
      },
      null,
      2,
    )}\n`,
  )
  process.exit(0)
}

const bookmark = JSON.parse(wrangler(['d1', 'time-travel', 'info', 'dshx-framework-hub', '--json'])) as { bookmark: string }
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'dshx-catalog-maintenance-'))
const now = Date.now()
try {
  for (let offset = 0; offset < writeSet.length; offset += batchSize) {
    const batch = writeSet.slice(offset, offset + batchSize)
    executeBatch(batch.map(plugin => sqlFor(plugin, now)).join('\n'), offset / batchSize, temporaryDirectory)
    process.stdout.write(`Applied ${Math.min(offset + batch.length, writeSet.length)}/${writeSet.length}\n`)
  }

  const verification = query<Record<string, number>>(`select
    (select count(*) from plugins where status='published') published,
    (select count(*) from plugin_localizations where instr(overview_markdown,'The public source does not provide a separate feature list')>0) en_placeholders,
    (select count(*) from plugin_localizations where instr(overview_markdown,'README 记录的主要能力和行为包括：The public source')>0) zh_placeholders,
    (select count(*) from plugin_localizations where instr(overview_markdown,'具体用途以已保存的公开 README 为准')>0 or instr(overview_markdown,'具体能力以已保存的公开 README 为准')>0) low_information_zh,
    (select count(*) from plugin_localizations where (locale='en' and instr(seo_title,'DeepSeek Harness Plugin | DSHX')=0) or (locale='zh' and instr(seo_title,'DeepSeek Harness 插件 | DSHX')=0)) invalid_seo_titles,
    (select count(*) from plugin_localizations where length(seo_description)>case when locale='en' then 160 else 96 end) oversized_seo_descriptions,
    (select count(*) from plugin_localizations where instr(overview_markdown,'--profile web add')>0) web_profile_overviews,
    (select count(*) from plugin_operation_audit where request_id=${sqlLiteral(runId)}) audit_entries`)[0]
  if (
    !verification ||
    verification.published !== prepared.length ||
    verification.en_placeholders !== 0 ||
    verification.zh_placeholders !== 0 ||
    verification.low_information_zh !== 0 ||
    verification.invalid_seo_titles !== 0 ||
    verification.oversized_seo_descriptions !== 0 ||
    verification.audit_entries !== writeSet.length
  )
    throw new Error(`Post-write verification failed: ${JSON.stringify(verification)}`)

  const completedAt = new Date()
  const reportPath = join(temporaryDirectory, 'report.json')
  writeFileSync(
    reportPath,
    JSON.stringify({
      schemaVersion: 1,
      runId,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      outcome: 'completed',
      body: {
        en: `Completed reviewed Chinese content enrichment for ${writeSet.length} published plugins whose prior localization only repeated a name or redirected readers to the README. The new leads preserve concrete capabilities from saved public sources, regenerate Chinese summaries and SEO descriptions, and retain the default DSH web profile installation guidance. Production verification found no remaining known low-information Chinese templates or invalid SEO metadata.`,
        zh: `已完成 ${writeSet.length} 个已发布插件的中文内容增补。这些条目的旧本地化仅复述名称或要求读者自行查看 README；新概述已依据保存的公开来源提炼具体用途与能力，并重新生成中文简介和 SEO 描述，同时保留默认 DSH web profile 安装说明。生产验证未发现遗留的已知低信息中文模板或不合格 SEO 元数据。`,
      },
    }),
  )
  run('node', [cliEntrypoint, 'report', 'publish', '--hub', 'https://dshx.io', '--input', reportPath])
  process.stdout.write(`${JSON.stringify({ mode: 'applied', runId, bookmark: bookmark.bookmark, validation, verification }, null, 2)}\n`)
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
