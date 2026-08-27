import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hubListResponseSchema,
  MarketplaceHostService,
  resolveCurrentProfile,
  type CliRunResult,
  type MarketplaceHostDependencies,
} from '../src/host-service.js'

const createdDirectories: string[] = []

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function profileFixture(initialBundles: readonly string[] = []) {
  const dir = await mkdtemp(join(tmpdir(), 'dshx-marketplace-'))
  createdDirectories.push(dir)
  let bundles = [...initialBundles]
  const dependencies = {
    resolveProfileDir: () => dir,
    readProfileManifest: () => ({
      dsh: { profile: { bundles: [...bundles] } },
    }),
  }
  const ctx = { baseUrl: pathToFileURL(dir).href } as Context
  return {
    ctx,
    dir,
    dependencies,
    setBundles(next: readonly string[]) {
      bundles = [...next]
    },
  }
}

function card(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    slug: 'community-tool',
    name: 'Community tool',
    scope: '@fixture/community-tool',
    description: 'A fixture plugin for marketplace tests.',
    version: '1.2.3',
    compat: '>=0.1.0-rc.8 <0.2.0-0',
    category: 'tools',
    badge: 'community',
    glyph: 'C',
    iconUrl: '/api/media/icon',
    ...overrides,
  }
}

function detail(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    plugin: card(),
    installTargets: [
      {
        kind: 'npm',
        spec: '@fixture/community-tool@1.2.3',
        package_name: '@fixture/community-tool',
        version: '1.2.3',
        integrity: null,
        is_primary: 1,
        status: 'active',
      },
    ],
    ...overrides,
  }
}

function response(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json',
      ...Object.fromEntries(new Headers(headers)),
    },
  })
}

function cliResult(overrides: Partial<CliRunResult> = {}): CliRunResult {
  return {
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    cancelled: false,
    ...overrides,
  }
}

async function serviceFixture(options: {
  readonly bundles?: readonly string[]
  readonly fetchValue?: unknown
  readonly runCli?: MarketplaceHostDependencies['runCli']
  readonly hubBaseUrl?: string
}) {
  const profile = await profileFixture(options.bundles)
  const fetchMock = vi.fn(async () => response(options.fetchValue ?? detail()))
  const runCli = options.runCli ?? vi.fn(async () => cliResult())
  const service = new MarketplaceHostService({
    ...profile.dependencies,
    fetch: fetchMock as unknown as typeof fetch,
    resolveDshCli: async () => ({
      cliPath: '/installation/dsh/lib/bin.js',
      version: '0.1.0-rc.8',
    }),
    runCli,
    settings: () => ({ hubBaseUrl: options.hubBaseUrl ?? 'https://hub.example.test' }),
    logError: vi.fn(),
  })
  return { ...profile, service, fetchMock, runCli }
}

describe('Framework Hub response validation', () => {
  it('accepts the previous list response shape and defaults categories to an empty list', () => {
    expect(hubListResponseSchema.parse({ items: [], nextCursor: null }).categories).toEqual([])
  })

  it('rejects more than one marketplace page', () => {
    expect(() =>
      hubListResponseSchema.parse({
        items: Array.from({ length: 25 }, () => card()),
        nextCursor: null,
      }),
    ).toThrow()
  })
})

describe('current Profile resolution', () => {
  it('accepts the exact local Profile base URL and rejects unrelated directories', async () => {
    const fixture = await profileFixture(['@fixture/installed'])
    const resolvedDirectory = await realpath(fixture.dir)
    await expect(resolveCurrentProfile(fixture.ctx.baseUrl!, fixture.dependencies)).resolves.toMatchObject({
      dir: resolvedDirectory,
      bundles: ['@fixture/installed'],
    })
    await expect(resolveCurrentProfile(pathToFileURL(tmpdir()).href, fixture.dependencies)).rejects.toThrow('not the current local')
  })
})

describe('MarketplaceHostService.list', () => {
  it('forwards locale, category, cursor and returns categories, install state and compatibility', async () => {
    const fixture = await serviceFixture({
      bundles: ['@fixture/community-tool'],
      fetchValue: {
        items: [card()],
        categories: [{ slug: 'tools', name: '工具' }],
        nextCursor: 'next-page',
      },
    })
    const result = await fixture.service.list({ locale: 'zh', category: 'tools', cursor: 'cursor-one' }, fixture.ctx, new AbortController().signal)
    expect(result.categories).toEqual([{ slug: 'tools', name: '工具' }])
    expect(result.items[0]).toMatchObject({
      installed: true,
      compatibility: 'compatible',
    })
    expect(result.items[0]?.iconUrl).toBe('https://hub.example.test/api/media/icon')
    const url = new URL(String(fixture.fetchMock.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/api/marketplace/plugins')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      locale: 'zh',
      category: 'tools',
      cursor: 'cursor-one',
      limit: '24',
      sort: 'latest',
    })
  })

  it('distinguishes an unknown range from a valid unsatisfied range on the dedicated API', async () => {
    const fixture = await serviceFixture({
      fetchValue: {
        items: [card({ compat: 'not-semver' }), card({ slug: 'future', compat: '>=9' })],
        categories: [],
        nextCursor: null,
      },
    })
    const result = await fixture.service.list({ locale: 'en' }, fixture.ctx, new AbortController().signal)
    expect(result.items).toHaveLength(2)
    expect(result.items).toEqual([
      expect.objectContaining({
        slug: 'community-tool',
        compatibility: 'unknown',
      }),
      expect.objectContaining({
        slug: 'future',
        compatibility: 'incompatible',
      }),
    ])
  })

  it('falls back to the legacy list endpoint when an old Hub reports a list-level 404', async () => {
    const profile = await profileFixture()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, 404))
      .mockResolvedValueOnce(response({ items: [card()], nextCursor: null }))
    const service = new MarketplaceHostService({
      ...profile.dependencies,
      fetch: fetchMock as unknown as typeof fetch,
      resolveDshCli: async () => ({
        cliPath: '/installation/dsh/lib/bin.js',
        version: '0.1.0-rc.8',
      }),
      settings: () => ({ hubBaseUrl: 'https://hub.example.test' }),
      logError: vi.fn(),
    })
    await expect(service.list({ locale: 'en' }, profile.ctx, new AbortController().signal)).resolves.toMatchObject({
      items: [expect.objectContaining({ slug: 'community-tool' })],
    })
    expect(fetchMock.mock.calls.map((call: unknown[]) => new URL(String(call[0])).pathname)).toEqual(['/api/marketplace/plugins', '/api/plugins'])
  })

  it('fails closed instead of treating a dedicated API 500 as an old Hub', async () => {
    const profile = await profileFixture()
    const fetchMock = vi.fn().mockResolvedValueOnce(response({}, 500))
    const service = new MarketplaceHostService({
      ...profile.dependencies,
      fetch: fetchMock as unknown as typeof fetch,
      resolveDshCli: async () => ({
        cliPath: '/installation/dsh/lib/bin.js',
        version: '0.1.0-rc.8',
      }),
      settings: () => ({ hubBaseUrl: 'https://hub.example.test' }),
      logError: vi.fn(),
    })
    await expect(service.list({ locale: 'en' }, profile.ctx, new AbortController().signal)).rejects.toThrow('marketplace is unavailable')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('recognizes the production legacy JSON route miss without accepting arbitrary 500 responses', async () => {
    const profile = await profileFixture()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ error: 'Only HTML requests are supported here' }, 500))
      .mockResolvedValueOnce(response({ items: [card()], nextCursor: null }))
    const service = new MarketplaceHostService({
      ...profile.dependencies,
      fetch: fetchMock as unknown as typeof fetch,
      resolveDshCli: async () => ({
        cliPath: '/installation/dsh/lib/bin.js',
        version: '0.1.0-rc.8',
      }),
      settings: () => ({ hubBaseUrl: 'https://hub.example.test' }),
      logError: vi.fn(),
    })

    await expect(service.list({ locale: 'en' }, profile.ctx, new AbortController().signal)).resolves.toMatchObject({
      items: [expect.objectContaining({ slug: 'community-tool' })],
    })
    expect(fetchMock.mock.calls.map((call: unknown[]) => new URL(String(call[0])).pathname)).toEqual(['/api/marketplace/plugins', '/api/plugins'])
  })

  it('recognizes the production legacy redirect, skips placeholder-only pages and remembers legacy mode for install', async () => {
    const profile = await profileFixture(['@fixture/community-tool'])
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, 307, { location: '/en/marketplace/plugins?locale=en' }))
      .mockResolvedValueOnce(
        response({
          items: [card({ version: 'unknown', compat: 'not declared' })],
          nextCursor: 'legacy-two',
        }),
      )
      .mockResolvedValueOnce(response({ items: [card()], nextCursor: null }))
      .mockResolvedValueOnce(response(detail()))
    const service = new MarketplaceHostService({
      ...profile.dependencies,
      fetch: fetchMock as unknown as typeof fetch,
      resolveDshCli: async () => ({
        cliPath: '/installation/dsh/lib/bin.js',
        version: '0.1.0-rc.8',
      }),
      settings: () => ({ hubBaseUrl: 'https://hub.example.test' }),
      logError: vi.fn(),
    })

    await expect(service.list({ locale: 'en' }, profile.ctx, new AbortController().signal)).resolves.toMatchObject({
      items: [expect.objectContaining({ slug: 'community-tool', installed: true })],
      nextCursor: null,
    })
    await expect(service.install('community-tool', profile.ctx, new AbortController().signal)).resolves.toMatchObject({
      status: 'already-installed',
    })
    const urls: URL[] = fetchMock.mock.calls.map((call: unknown[]) => new URL(String(call[0])))
    expect(urls.map(url => url.pathname)).toEqual(['/api/marketplace/plugins', '/api/plugins', '/api/plugins', '/api/plugins/community-tool'])
    expect(urls[2]?.searchParams.get('cursor')).toBe('legacy-two')
  })

  it('does not downgrade a dedicated detail 404 to the discovery detail API', async () => {
    const profile = await profileFixture()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [card()], categories: [], nextCursor: null }))
      .mockResolvedValueOnce(response({}, 404))
    const service = new MarketplaceHostService({
      ...profile.dependencies,
      fetch: fetchMock as unknown as typeof fetch,
      resolveDshCli: async () => ({
        cliPath: '/installation/dsh/lib/bin.js',
        version: '0.1.0-rc.8',
      }),
      settings: () => ({ hubBaseUrl: 'https://hub.example.test' }),
      logError: vi.fn(),
    })

    await service.list({ locale: 'en' }, profile.ctx, new AbortController().signal)
    await expect(service.install('community-tool', profile.ctx, new AbortController().signal)).resolves.toMatchObject({
      status: 'failed',
      code: 'catalog-unavailable',
    })
    expect(fetchMock.mock.calls.map((call: unknown[]) => new URL(String(call[0])).pathname)).toEqual([
      '/api/marketplace/plugins',
      '/api/marketplace/plugins/community-tool',
    ])
  })
})

describe('MarketplaceHostService.install', () => {
  it('is idempotent when the exact bundle is already active', async () => {
    const fixture = await serviceFixture({
      bundles: ['@fixture/community-tool'],
    })
    await expect(fixture.service.install('community-tool', fixture.ctx, new AbortController().signal)).resolves.toMatchObject({
      status: 'already-installed',
      packageName: '@fixture/community-tool',
      restartRequired: true,
    })
    expect(fixture.runCli).not.toHaveBeenCalled()
  })

  it('validates the exact active target before reporting an installed bundle', async () => {
    const fixture = await serviceFixture({
      bundles: ['@fixture/community-tool'],
      fetchValue: detail({
        installTargets: [
          {
            ...detail().installTargets[0],
            package_name: '@fixture/other',
          },
        ],
      }),
    })
    await expect(fixture.service.install('community-tool', fixture.ctx, new AbortController().signal)).resolves.toMatchObject({
      status: 'failed',
      code: 'target-unavailable',
    })
    expect(fixture.runCli).not.toHaveBeenCalled()
  })

  it('installs a community plugin with the verified spec and verifies activation', async () => {
    const profile = await profileFixture()
    const runCli = vi.fn(async (_cliPath: string, _args: readonly string[]) => {
      profile.setBundles(['@fixture/community-tool'])
      return cliResult()
    })
    const service = new MarketplaceHostService({
      ...profile.dependencies,
      fetch: vi.fn(async () => response(detail())) as unknown as typeof fetch,
      resolveDshCli: async () => ({
        cliPath: '/installation/dsh/lib/bin.js',
        version: '0.1.0-rc.8',
      }),
      runCli,
      settings: () => ({ hubBaseUrl: 'https://hub.example.test' }),
      logError: vi.fn(),
    })
    await expect(service.install('community-tool', profile.ctx, new AbortController().signal)).resolves.toMatchObject({
      status: 'installed',
      packageName: '@fixture/community-tool',
      version: '1.2.3',
      restartRequired: true,
    })
    const resolvedDirectory = await realpath(profile.dir)
    expect(runCli).toHaveBeenCalledWith(
      '/installation/dsh/lib/bin.js',
      ['plugin', '--profile', expect.any(String), 'add', '@fixture/community-tool@1.2.3'],
      expect.objectContaining({
        cwd: resolvedDirectory,
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('allows compatibility warnings but rejects inactive, mismatched and mutable primary targets', async () => {
    const unknown = await serviceFixture({
      fetchValue: detail({ plugin: card({ compat: 'not-semver' }) }),
    })
    await expect(unknown.service.install('community-tool', unknown.ctx, new AbortController().signal)).resolves.toMatchObject({
      code: 'activation-missing',
    })

    const incompatible = await serviceFixture({
      fetchValue: detail({ plugin: card({ compat: '>=9' }) }),
    })
    await expect(incompatible.service.install('community-tool', incompatible.ctx, new AbortController().signal)).resolves.toMatchObject({
      code: 'activation-missing',
    })

    const inactive = await serviceFixture({
      fetchValue: detail({
        installTargets: [{ ...detail().installTargets[0], status: 'disabled' }],
      }),
    })
    await expect(inactive.service.install('community-tool', inactive.ctx, new AbortController().signal)).resolves.toMatchObject({ code: 'target-unavailable' })

    const mismatched = await serviceFixture({
      fetchValue: detail({
        installTargets: [{ ...detail().installTargets[0], package_name: '@fixture/other' }],
      }),
    })
    await expect(mismatched.service.install('community-tool', mismatched.ctx, new AbortController().signal)).resolves.toMatchObject({
      code: 'target-unavailable',
    })

    const mutable = await serviceFixture({
      fetchValue: detail({
        installTargets: [{ ...detail().installTargets[0], spec: '@fixture/community-tool@latest' }],
      }),
    })
    await expect(mutable.service.install('community-tool', mutable.ctx, new AbortController().signal)).resolves.toMatchObject({
      code: 'target-unavailable',
    })
    expect(unknown.runCli).toHaveBeenCalledOnce()
    expect(incompatible.runCli).toHaveBeenCalledOnce()
    expect(inactive.runCli).not.toHaveBeenCalled()
    expect(mismatched.runCli).not.toHaveBeenCalled()
    expect(mutable.runCli).not.toHaveBeenCalled()
  })

  it('verifies a GitHub target against the canonical repository and latest stable tag', async () => {
    const exactTarget = {
      kind: 'github',
      spec: 'github:fixture/community-tool#v1.2.3',
      package_name: '@fixture/community-tool',
      version: '1.2.3',
      integrity: null,
      is_primary: 1,
      status: 'active',
    }
    const exactDetail = detail({
      repositoryUrl: 'https://github.com/fixture/community-tool',
      releases: [{ version: '1.2.3', channel: 'stable', git_tag: 'v1.2.3' }],
      installTargets: [exactTarget],
    })
    const exact = await serviceFixture({
      bundles: ['@fixture/community-tool'],
      fetchValue: exactDetail,
    })
    await expect(exact.service.install('community-tool', exact.ctx, new AbortController().signal)).resolves.toMatchObject({
      status: 'already-installed',
    })

    const mutable = await serviceFixture({
      bundles: ['@fixture/community-tool'],
      fetchValue: detail({
        ...exactDetail,
        installTargets: [{ ...exactTarget, spec: 'github:fixture/community-tool#main' }],
      }),
    })
    await expect(mutable.service.install('community-tool', mutable.ctx, new AbortController().signal)).resolves.toMatchObject({
      status: 'failed',
      code: 'target-unavailable',
    })
  })

  it('accepts an absolute local tgz only from an HTTP loopback Hub', async () => {
    const archive = join(tmpdir(), 'dshx-marketplace-target.tgz')
    const profile = await profileFixture()
    const runCli = vi.fn(async () => {
      profile.setBundles(['@fixture/community-tool'])
      return cliResult()
    })
    const service = new MarketplaceHostService({
      ...profile.dependencies,
      fetch: vi.fn(async () =>
        response(
          detail({
            installTargets: [{ ...detail().installTargets[0], spec: archive }],
          }),
        ),
      ) as unknown as typeof fetch,
      resolveDshCli: async () => ({ cliPath: '/installation/dsh/lib/bin.js', version: '0.1.0-rc.8' }),
      runCli,
      settings: () => ({ hubBaseUrl: 'http://127.0.0.1:4173' }),
      logError: vi.fn(),
    })

    await expect(service.install('community-tool', profile.ctx, new AbortController().signal)).resolves.toMatchObject({
      status: 'installed',
    })
    expect(runCli).toHaveBeenCalledWith('/installation/dsh/lib/bin.js', ['plugin', '--profile', expect.any(String), 'add', archive], expect.any(Object))

    const production = await serviceFixture({
      bundles: ['@fixture/community-tool'],
      fetchValue: detail({
        installTargets: [{ ...detail().installTargets[0], spec: archive }],
      }),
    })
    await expect(production.service.install('community-tool', production.ctx, new AbortController().signal)).resolves.toMatchObject({
      code: 'target-unavailable',
    })
  })

  it('holds one global task per service and releases the mutex after completion', async () => {
    let release!: (result: CliRunResult) => void
    const running = new Promise<CliRunResult>(resolve => {
      release = resolve
    })
    const fixture = await serviceFixture({
      runCli: vi.fn(async () => running),
    })
    const first = fixture.service.install('community-tool', fixture.ctx, new AbortController().signal)
    await vi.waitFor(() => {
      expect(fixture.runCli).toHaveBeenCalledOnce()
    })
    await expect(fixture.service.install('community-tool', fixture.ctx, new AbortController().signal)).resolves.toMatchObject({ code: 'busy' })
    release(cliResult({ exitCode: 1 }))
    await first
    await fixture.service.install('community-tool', fixture.ctx, new AbortController().signal)
    expect(fixture.runCli).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['timeout', cliResult({ timedOut: true }), 'timeout'],
    ['cancel', cliResult({ cancelled: true }), 'cancelled'],
    ['CLI failure', cliResult({ exitCode: 2, stderr: 'private local path' }), 'install-failed'],
  ] as const)('maps %s to a stable browser-safe code', async (_label: string, result: CliRunResult, code: string) => {
    const fixture = await serviceFixture({
      runCli: vi.fn(async () => result),
    })
    await expect(fixture.service.install('community-tool', fixture.ctx, new AbortController().signal)).resolves.toEqual({
      status: 'failed',
      code,
      retryable: true,
    })
  })

  it('rejects a zero exit when the bundle was not activated', async () => {
    const fixture = await serviceFixture({
      runCli: vi.fn(async () => cliResult()),
    })
    await expect(fixture.service.install('community-tool', fixture.ctx, new AbortController().signal)).resolves.toMatchObject({
      status: 'failed',
      code: 'activation-missing',
    })
  })
})
