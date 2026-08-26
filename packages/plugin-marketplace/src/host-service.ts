import { readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { readProfileManifest, resolveProfileDir, type ProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { execaNode } from 'execa'
import { satisfies, valid, validRange } from 'semver'
import { z } from 'zod'
import type { MarketplaceInstallOutput, MarketplaceListInput, MarketplaceListOutput } from './api.js'
import { getMarketplaceSettings, normalizeHubBaseUrl } from './settings.js'

const PAGE_SIZE = 24
const HUB_TIMEOUT_MS = 15_000
const MAX_LEGACY_SCAN_PAGES = 100
export const INSTALL_TIMEOUT_MS = 5 * 60_000
const HOST_LOG_PREFIX = '[dshx-plugin-marketplace]'

class HubHttpError extends Error {
  constructor(
    readonly status: number,
    readonly location: string | null,
    readonly legacyRouteMiss: boolean,
  ) {
    super(`Framework Hub returned HTTP ${status}.`)
  }
}

type HubMarketplaceMode = 'dedicated' | 'legacy'

const hubCategorySchema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().min(1).max(100),
})

const hubCardSchema = z.object({
  slug: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  scope: z.string().min(1).max(240),
  description: z.string().max(600),
  version: z.string().min(1).max(100),
  compat: z.string().min(1).max(160),
  category: z.string().min(1).max(80),
  badge: z.enum(['official', 'verified', 'community']),
  glyph: z.string().min(1).max(4),
  iconUrl: z.string().nullable(),
})

export const hubListResponseSchema = z.object({
  items: z.array(hubCardSchema).max(PAGE_SIZE),
  nextCursor: z.string().max(1000).nullable(),
  // Older Framework Hub deployments remain readable during a rolling update.
  categories: z.array(hubCategorySchema).max(100).optional().default([]),
})

const installTargetSchema = z.object({
  kind: z.enum(['npm', 'github']),
  spec: z.string().min(1).max(1000),
  package_name: z.string().min(1).max(240),
  version: z.string().min(1).max(100),
  integrity: z.string().nullable(),
  is_primary: z.union([z.literal(0), z.literal(1), z.boolean()]),
  status: z.string().min(1).max(40),
})

export const hubDetailResponseSchema = z.object({
  plugin: hubCardSchema,
  installTargets: z.array(installTargetSchema).max(20),
  repositoryUrl: z.string().url().max(2_048).nullable().optional(),
  releases: z
    .array(
      z.object({
        version: z.string().min(1).max(100),
        channel: z.enum(['stable', 'prerelease']),
        git_tag: z.string().min(1).max(255).nullable(),
      }),
    )
    .max(20)
    .optional()
    .default([]),
})

export interface CurrentProfile {
  readonly name: string
  readonly dir: string
  readonly manifest: ProfileManifest
  readonly bundles: readonly string[]
}

export interface DshCliResolution {
  readonly cliPath: string
  readonly version: string
}

export interface CliRunResult {
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
  readonly cancelled: boolean
}

export interface MarketplaceHostDependencies {
  readonly fetch: typeof fetch
  readonly resolveProfileDir: typeof resolveProfileDir
  readonly readProfileManifest: typeof readProfileManifest
  readonly resolveDshCli: () => Promise<DshCliResolution>
  readonly runCli: (cliPath: string, args: readonly string[], options: { readonly cwd: string; readonly signal: AbortSignal }) => Promise<CliRunResult>
  readonly settings: () => { readonly hubBaseUrl: string }
  readonly logError: (message: string, error?: unknown) => void
}

const defaultDependencies: MarketplaceHostDependencies = {
  fetch: globalThis.fetch,
  resolveProfileDir,
  readProfileManifest,
  resolveDshCli,
  runCli: runDshCli,
  settings: getMarketplaceSettings,
  logError(message, error) {
    console.error(HOST_LOG_PREFIX, message, error)
  },
}

function combineSignals(signal: AbortSignal, timeoutMs: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
}

function safeLogText(value: string): string {
  return value.length <= 8_000 ? value : `${value.slice(0, 8_000)}\n…truncated`
}

function contextBaseUrl(ctx: Context): string {
  if (typeof ctx.baseUrl !== 'string' || ctx.baseUrl.length === 0) {
    throw new Error('The current Loader did not expose a Profile base URL.')
  }
  return ctx.baseUrl
}

function assertBundleList(manifest: ProfileManifest): readonly string[] {
  const bundles = manifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles) || !bundles.every(bundle => typeof bundle === 'string' && bundle.length > 0)) {
    throw new Error('Current DSH profile has no valid bundle list.')
  }
  return bundles
}

/** Resolve and verify that the Loader base URL belongs to one local DSH profile. */
export async function resolveCurrentProfile(
  baseUrl: string,
  dependencies: Pick<MarketplaceHostDependencies, 'resolveProfileDir' | 'readProfileManifest'>,
): Promise<CurrentProfile> {
  const url = new URL(baseUrl)
  if (url.protocol !== 'file:') throw new Error('The plugin marketplace is only available from a local DSH profile.')
  const dir = await realpath(resolve(fileURLToPath(url)))
  const name = basename(dir)
  if (name === '' || name === '.' || name === '..') throw new Error('Unable to determine the current DSH profile.')
  const expected = await realpath(resolve(dependencies.resolveProfileDir(name)))
  if (dir !== expected) throw new Error('The Loader base URL is not the current local DSH profile directory.')
  const manifest = dependencies.readProfileManifest('dshx-plugin-marketplace', dir)
  return { name, dir, manifest, bundles: assertBundleList(manifest) }
}

function compatibility(version: string, range: string): 'compatible' | 'incompatible' | 'unknown' {
  if (valid(version) === null || validRange(range) === null) return 'unknown'
  return satisfies(version, range, { includePrerelease: true }) ? 'compatible' : 'incompatible'
}

function hubUrl(baseUrl: string, pathname: string, search?: URLSearchParams): URL {
  const base = `${normalizeHubBaseUrl(baseUrl)}/`
  const url = new URL(pathname.replace(/^\//, ''), base)
  if (search !== undefined) url.search = search.toString()
  return url
}

async function fetchJson(dependencies: MarketplaceHostDependencies, url: URL, signal: AbortSignal): Promise<unknown> {
  const response = await dependencies.fetch(url, {
    headers: { accept: 'application/json' },
    // Do not follow an API miss into a localized HTML page. A manual response
    // also lets the Host distinguish the legacy TanStack catch-all redirect
    // from a real Hub failure without trusting response HTML.
    redirect: 'manual',
    signal: combineSignals(signal, HUB_TIMEOUT_MS),
  })
  if (!response.ok) {
    let legacyRouteMiss = false
    if (response.status === 500 && response.headers.get('content-type')?.toLocaleLowerCase().includes('application/json')) {
      try {
        const value = JSON.parse(await response.text()) as unknown
        legacyRouteMiss =
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value) &&
          Object.keys(value).length === 1 &&
          (value as { readonly error?: unknown }).error === 'Only HTML requests are supported here'
      } catch {
        // An arbitrary or malformed 500 remains a hard failure.
      }
    }
    throw new HubHttpError(response.status, response.headers.get('location'), legacyRouteMiss)
  }
  return response.json()
}

function isLegacyMarketplaceRedirect(error: HubHttpError, pathname: string): boolean {
  if (![307, 308].includes(error.status) || error.location === null) return false
  try {
    const redirected = new URL(error.location, 'https://framework-hub.invalid')
    const webPath = pathname.replace(/^\/api/, '')
    return redirected.pathname === `/en${webPath}` || redirected.pathname === `/zh${webPath}`
  } catch {
    return false
  }
}

function isLegacyCard(item: z.infer<typeof hubCardSchema>): boolean {
  return valid(item.version) !== null && validRange(item.compat) !== null
}

async function fetchLegacyListPage(
  dependencies: MarketplaceHostDependencies,
  baseUrl: string,
  search: URLSearchParams,
  signal: AbortSignal,
): Promise<z.infer<typeof hubListResponseSchema>> {
  const query = new URLSearchParams(search)
  const scanSignal = combineSignals(signal, HUB_TIMEOUT_MS)
  const seenCursors = new Set<string>()
  const initialCursor = query.get('cursor')
  if (initialCursor !== null) seenCursors.add(initialCursor)

  for (let pageNumber = 0; pageNumber < MAX_LEGACY_SCAN_PAGES; pageNumber += 1) {
    const raw = await fetchJson(dependencies, hubUrl(baseUrl, '/api/plugins', query), scanSignal)
    const page = hubListResponseSchema.parse(raw)
    const items = page.items.filter(isLegacyCard)
    if (items.length > 0 || page.nextCursor === null) return { ...page, items }
    if (seenCursors.has(page.nextCursor)) throw new Error('Framework Hub returned a repeated legacy cursor.')
    seenCursors.add(page.nextCursor)
    query.set('cursor', page.nextCursor)
  }

  throw new Error('Framework Hub legacy pagination exceeded the safety limit.')
}

function absoluteIconUrl(baseUrl: string, iconUrl: string | null): string | null {
  if (iconUrl === null) return null
  try {
    return new URL(iconUrl, `${normalizeHubBaseUrl(baseUrl)}/`).href
  } catch {
    return null
  }
}

function isLoopbackHttpHub(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl)
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function githubRepositoryFullName(repositoryUrl: string | null | undefined): string | undefined {
  if (repositoryUrl === null || repositoryUrl === undefined) return undefined
  try {
    const url = new URL(repositoryUrl)
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLocaleLowerCase() !== 'github.com' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    )
      return undefined
    const segments = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
    if (segments.length !== 2) return undefined
    const owner = segments[0]
    const repository = segments[1]?.replace(/\.git$/, '')
    if (owner === undefined || repository === undefined || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repository)) {
      return undefined
    }
    return `${owner}/${repository}`
  } catch {
    return undefined
  }
}

function primaryTarget(detail: z.infer<typeof hubDetailResponseSchema>, hubBaseUrl: string) {
  const candidates = detail.installTargets.filter(target => (target.is_primary === true || target.is_primary === 1) && target.status === 'active')
  if (candidates.length !== 1) return undefined
  const target = candidates[0]
  if (target === undefined || target.package_name !== detail.plugin.scope || target.version !== detail.plugin.version) return undefined
  const localArchive = target.kind === 'npm' && isLoopbackHttpHub(hubBaseUrl) && isAbsolute(target.spec) && target.spec.toLocaleLowerCase().endsWith('.tgz')
  if (/[\0\r\n]/.test(target.spec) || target.spec.startsWith('-') || (/\s/.test(target.spec) && !localArchive)) return undefined
  if (target.kind === 'npm') {
    if (!localArchive && target.spec !== `${target.package_name}@${target.version}`) return undefined
  } else {
    const repository = githubRepositoryFullName(detail.repositoryUrl)
    const releases = detail.releases.filter(
      release => release.version === detail.plugin.version && release.channel === 'stable' && release.git_tag !== null && release.git_tag.length > 0,
    )
    if (repository === undefined || releases.length !== 1 || target.spec !== `github:${repository}#${releases[0]?.git_tag}`) return undefined
  }
  return target
}

async function resolveDshCli(): Promise<DshCliResolution> {
  const require = createRequire(import.meta.url)
  const manifestPath = require.resolve('@deepseek-ai/dsh/package.json')
  const manifestSchema = z.object({
    version: z.string().min(1),
    bin: z.union([z.string(), z.record(z.string(), z.string())]),
  })
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')))
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.dsh
  if (bin === undefined || bin.length === 0) throw new Error('@deepseek-ai/dsh does not declare the dsh CLI entry.')
  return {
    cliPath: resolve(dirname(manifestPath), bin),
    version: manifest.version,
  }
}

async function runDshCli(cliPath: string, args: readonly string[], options: { readonly cwd: string; readonly signal: AbortSignal }): Promise<CliRunResult> {
  try {
    const result = await execaNode(cliPath, [...args], {
      cwd: options.cwd,
      cancelSignal: options.signal,
      timeout: INSTALL_TIMEOUT_MS,
      reject: false,
      maxBuffer: 64 * 1024,
      env: { NO_COLOR: '1' },
    })
    return {
      exitCode: result.exitCode ?? null,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: result.timedOut,
      cancelled: result.isCanceled,
    }
  } catch (error) {
    const value = error as Partial<{
      exitCode: number
      stdout: string
      stderr: string
      timedOut: boolean
      isCanceled: boolean
    }>
    return {
      exitCode: value.exitCode ?? null,
      stdout: value.stdout ?? '',
      stderr: value.stderr ?? String(error),
      timedOut: value.timedOut ?? false,
      cancelled: value.isCanceled ?? options.signal.aborted,
    }
  }
}

function failed(code: Extract<MarketplaceInstallOutput, { status: 'failed' }>['code'], retryable: boolean): MarketplaceInstallOutput {
  return { status: 'failed', code, retryable }
}

/** Host-owned catalog reader and single-flight installer. */
export class MarketplaceHostService {
  private installing = false
  private readonly dependencies: MarketplaceHostDependencies
  private readonly hubModes = new Map<string, HubMarketplaceMode>()

  constructor(dependencies: Partial<MarketplaceHostDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies }
  }

  private hubModeKey(baseUrl: string): string {
    return normalizeHubBaseUrl(baseUrl)
  }

  private async listPage(baseUrl: string, query: URLSearchParams, signal: AbortSignal): Promise<z.infer<typeof hubListResponseSchema>> {
    const key = this.hubModeKey(baseUrl)
    const mode = this.hubModes.get(key)
    if (mode === 'legacy') return fetchLegacyListPage(this.dependencies, baseUrl, query, signal)

    const pathname = '/api/marketplace/plugins'
    try {
      const raw = await fetchJson(this.dependencies, hubUrl(baseUrl, pathname, query), signal)
      const page = hubListResponseSchema.parse(raw)
      this.hubModes.set(key, 'dedicated')
      return page
    } catch (error) {
      // A list-level 404 unambiguously means that this old Hub has no
      // marketplace collection route. Depending on request negotiation,
      // production legacy deployments either emit their exact JSON-only route
      // miss or redirect to /en|zh/marketplace/plugins.
      const missingLegacyRoute =
        mode === undefined && error instanceof HubHttpError && (error.status === 404 || error.legacyRouteMiss || isLegacyMarketplaceRedirect(error, pathname))
      if (!missingLegacyRoute) throw error
      this.hubModes.set(key, 'legacy')
      return fetchLegacyListPage(this.dependencies, baseUrl, query, signal)
    }
  }

  private async pluginDetail(baseUrl: string, slug: string, query: URLSearchParams, signal: AbortSignal): Promise<unknown> {
    const key = this.hubModeKey(baseUrl)
    const mode = this.hubModes.get(key)
    const encodedSlug = encodeURIComponent(slug)
    if (mode === 'legacy') {
      return fetchJson(this.dependencies, hubUrl(baseUrl, `/api/plugins/${encodedSlug}`, query), signal)
    }

    const pathname = `/api/marketplace/plugins/${encodedSlug}`
    try {
      const raw = await fetchJson(this.dependencies, hubUrl(baseUrl, pathname, query), signal)
      this.hubModes.set(key, 'dedicated')
      return raw
    } catch (error) {
      // A detail 404 may mean that a current Hub deliberately rejected an
      // ineligible slug, so it must never trigger a downgrade. Only the legacy
      // framework's recognizable Web redirect proves the route is absent.
      if (mode !== undefined || !(error instanceof HubHttpError) || !isLegacyMarketplaceRedirect(error, pathname)) throw error
      this.hubModes.set(key, 'legacy')
      return fetchJson(this.dependencies, hubUrl(baseUrl, `/api/plugins/${encodedSlug}`, query), signal)
    }
  }

  async list(input: MarketplaceListInput, ctx: Context, signal: AbortSignal): Promise<MarketplaceListOutput> {
    try {
      const [profile, dsh] = await Promise.all([resolveCurrentProfile(contextBaseUrl(ctx), this.dependencies), this.dependencies.resolveDshCli()])
      const settings = this.dependencies.settings()
      const query = new URLSearchParams({
        locale: input.locale,
        sort: 'latest',
        limit: String(PAGE_SIZE),
      })
      if (input.category !== undefined) query.set('category', input.category)
      if (input.cursor !== undefined) query.set('cursor', input.cursor)
      const page = await this.listPage(settings.hubBaseUrl, query, signal)
      const installed = new Set(profile.bundles)
      return {
        categories: page.categories,
        items: page.items.map(item => ({
          slug: item.slug,
          name: item.name,
          packageName: item.scope,
          description: item.description,
          version: item.version,
          compatibilityRange: item.compat,
          compatibility: compatibility(dsh.version, item.compat),
          category: item.category,
          badge: item.badge,
          glyph: item.glyph,
          iconUrl: absoluteIconUrl(settings.hubBaseUrl, item.iconUrl),
          installed: installed.has(item.scope),
        })),
        nextCursor: page.nextCursor,
      }
    } catch (error) {
      this.dependencies.logError('Failed to list Framework Hub plugins.', error)
      throw new Error('Plugin marketplace is unavailable.')
    }
  }

  async install(slug: string, ctx: Context, signal: AbortSignal): Promise<MarketplaceInstallOutput> {
    if (this.installing) return failed('busy', true)
    this.installing = true
    try {
      let profile: CurrentProfile
      let dsh: DshCliResolution
      try {
        ;[profile, dsh] = await Promise.all([resolveCurrentProfile(contextBaseUrl(ctx), this.dependencies), this.dependencies.resolveDshCli()])
      } catch (error) {
        this.dependencies.logError('Failed to resolve the current Profile or DSH CLI.', error)
        return failed('profile-unavailable', false)
      }

      const settings = this.dependencies.settings()
      let detail: z.infer<typeof hubDetailResponseSchema>
      try {
        const query = new URLSearchParams({ locale: 'en' })
        const raw = await this.pluginDetail(settings.hubBaseUrl, slug, query, signal)
        detail = hubDetailResponseSchema.parse(raw)
      } catch (error) {
        this.dependencies.logError(`Failed to resolve the install target for ${slug}.`, error)
        return failed('catalog-unavailable', true)
      }

      const target = primaryTarget(detail, settings.hubBaseUrl)
      if (target === undefined) return failed('target-unavailable', false)
      if (profile.bundles.includes(target.package_name)) {
        return {
          status: 'already-installed',
          packageName: target.package_name,
          version: target.version,
          restartRequired: true,
        }
      }
      const compatibilityStatus = compatibility(dsh.version, detail.plugin.compat)
      if (compatibilityStatus === 'unknown') {
        return failed('compatibility-unknown', false)
      }
      if (compatibilityStatus === 'incompatible') {
        return failed('incompatible', false)
      }
      const installSignal = combineSignals(signal, INSTALL_TIMEOUT_MS)
      const args = ['plugin', '--profile', profile.name, 'add', target.spec] as const
      const result = await this.dependencies.runCli(dsh.cliPath, args, {
        cwd: profile.dir,
        signal: installSignal,
      })
      if (result.timedOut) return failed('timeout', true)
      if (result.cancelled || signal.aborted) return failed('cancelled', true)
      if (result.exitCode !== 0) {
        this.dependencies.logError(`DSH CLI failed for ${slug} (exit ${String(result.exitCode)}).\n${safeLogText(result.stderr || result.stdout)}`)
        return failed('install-failed', true)
      }

      let activated: readonly string[]
      try {
        activated = assertBundleList(this.dependencies.readProfileManifest('dshx-plugin-marketplace', profile.dir))
      } catch (error) {
        this.dependencies.logError(`Failed to verify Profile activation for ${slug}.`, error)
        return failed('activation-missing', true)
      }
      if (!activated.includes(target.package_name)) {
        this.dependencies.logError(`DSH CLI exited successfully but ${target.package_name} was not activated.`)
        return failed('activation-missing', true)
      }
      return {
        status: 'installed',
        packageName: target.package_name,
        version: target.version,
        restartRequired: true,
      }
    } finally {
      this.installing = false
    }
  }
}
