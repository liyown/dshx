import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { parseCliArgs } from '../src/cli/args.js'
import { runCli } from '../src/cli/run.js'
import type { CliIO } from '../src/cli/run.js'
import type { DevEvent, DevSession } from '../src/dev/index.js'
import type { ResolvedDshxConfig } from '../src/config/index.js'
import type { PreparedProjectProfile } from '../src/profile/index.js'
import type { InspectOptions, InspectTarget } from '../src/inspect/index.js'

function project(): ResolvedDshxConfig {
  return {
    root: '/project/plugin',
    packageFile: '/project/plugin/package.json',
    configDependencies: [],
    packageId: '@test/plugin',
    name: '@test/plugin',
    hostEntry: '/project/plugin/src/host.ts',
    clientEntry: '/project/plugin/src/client.tsx',
    outDir: '/project/plugin/dist',
    profile: 'web',
    dev: { hostRestart: 'manual' },
    build: { sourcemap: true },
    compatibility: { allowUnsupported: false },
    manifest: { name: '@test/plugin', type: 'module' },
  }
}

function io(): CliIO & { out: PassThrough; err: PassThrough } {
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean }
  stdin.isTTY = false
  const out = new PassThrough()
  const err = new PassThrough()
  return { stdin, stdout: out, stderr: err, out, err }
}

async function text(stream: PassThrough): Promise<string> {
  return new Promise(resolve => {
    const chunks: Buffer[] = []
    stream.on('data', chunk => chunks.push(Buffer.from(chunk)))
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

function profile(projectValue: ResolvedDshxConfig): PreparedProjectProfile {
  return {
    profile: projectValue.profile,
    packageId: projectValue.packageId,
    root: projectValue.root,
    link: 'existing',
    diagnostics: [],
    dsh: {
      version: '0.1.0-rc.8',
      adapterId: 'dsh-0.1',
      protocolGeneration: '0.1',
      supportedRange: '>=0.1.0-rc.8 <0.2.0',
      support: 'verified',
      diagnostics: [],
      compatibility: {
        id: 'dsh-0.1',
        protocolGeneration: '0.1',
        version: '0.1.0-rc.8',
        dshRange: '>=0.1.0-rc.8 <0.2.0',
        verifiedVersions: ['0.1.0-rc.8'],
        profile: { listCommand: 'plugin-list-json', addCommand: 'plugin-add' },
        inspect: { targets: ['slots', 'tools'], provider: 'unavailable' },
        nodeRange: '^22.19.0 || >=24.0.0',
        client: { platformModules: [], preloadedExternals: [], manifest: { platform: 'web', moduleRequestsField: 'external', packageEdgesField: 'inject' } },
      },
    },
  }
}

describe('CLI argument parser', () => {
  it('parses commands and command-specific options', () => {
    expect(parseCliArgs(['build', '--cwd', '/tmp/project', '--verbose'])).toMatchObject({ command: 'build', cwd: '/tmp/project', verbose: true })
    expect(parseCliArgs(['check', '--json'])).toMatchObject({ command: 'check', json: true })
    expect(parseCliArgs(['dev', '--open'])).toMatchObject({ command: 'dev', open: true })
    expect(parseCliArgs(['add', 'hook', '--event', 'agent.ready', '--file', 'src/ready.ts', '--dry-run', '--json'])).toMatchInlineSnapshot(`
      {
        "addTarget": "hook",
        "command": "add",
        "dryRun": true,
        "event": "agent.ready",
        "file": "src/ready.ts",
        "fix": false,
        "help": false,
        "json": true,
        "open": false,
        "verbose": false,
        "version": false,
      }
    `)
  })

  it('rejects unknown arguments and invalid option combinations', () => {
    expect(() => parseCliArgs([])).toThrow('A command is required')
    expect(() => parseCliArgs(['build', '--json'])).toThrow('--json')
    expect(() => parseCliArgs(['dev', '--cwd'])).toThrow('requires a value')
    expect(() => parseCliArgs(['wat'])).toThrow('Unknown argument')
    expect(() => parseCliArgs(['inspect'])).toThrow('requires a target')
    expect(() => parseCliArgs(['inspect', 'unknown-target'])).toThrow('Unknown argument')
    expect(() => parseCliArgs(['build', 'slots'])).toThrow('only valid with the inspect command')
  })

  it('parses inspect targets and JSON mode', () => {
    expect(parseCliArgs(['inspect', 'slots', '--json'])).toMatchObject({ command: 'inspect', inspectTarget: 'slots', json: true })
    expect(parseCliArgs(['inspect', 'slots', '--root', 'sidebar.footer.action'])).toMatchObject({ command: 'inspect', inspectTarget: 'slots', root: 'sidebar.footer.action' })
    expect(() => parseCliArgs(['inspect', 'services', '--root', 'logger'])).toThrow('--root')
    expect(parseCliArgs(['inspect', 'tools', '--verbose', '--cwd', '/tmp/project'])).toMatchObject({ command: 'inspect', inspectTarget: 'tools', verbose: true, cwd: '/tmp/project' })
    expect(parseCliArgs(['inspect', 'services'])).toMatchObject({ command: 'inspect', inspectTarget: 'services' })
    expect(parseCliArgs(['inspect', 'events'])).toMatchObject({ command: 'inspect', inspectTarget: 'events' })
  })

  it('parses add ui options and rejects non-ui add targets', () => {
    expect(parseCliArgs(['add', 'ui', '--slot', 'sidebar.footer.action', '--provider', '@provider/sidebar', '--order', '2', '--dry-run', '--json'])).toMatchObject({
      command: 'add', addTarget: 'ui', slot: 'sidebar.footer.action', provider: '@provider/sidebar', order: 2, dryRun: true, json: true,
    })
    expect(() => parseCliArgs(['add'])).toThrow('requires a target')
    expect(parseCliArgs(['add', 'tool'])).toMatchObject({ command: 'add', addTarget: 'tool' })
    expect(parseCliArgs(['add', 'command', '--name', 'status', '--description', 'Status'])).toMatchObject({ command: 'add', addTarget: 'command', name: 'status', description: 'Status' })
    expect(() => parseCliArgs(['add', 'ui', '--order', 'nope'])).toThrow('integer')
    expect(parseCliArgs(['add', 'tool', '--name', 'status', '--description', 'Status', '--dry-run', '--json'])).toMatchObject({ command: 'add', addTarget: 'tool', name: 'status', description: 'Status', dryRun: true, json: true })
  })
})

describe('CLI commands', () => {
  it('builds enabled faces in parallel and does not touch Profile APIs', async () => {
    const streams = io()
    const value = project()
    const calls: string[] = []
    const code = await runCli(['build'], {
      io: streams,
      runtime: {
        resolveConfig: async () => value,
        checkManifest: async () => [],
        buildHost: async () => { calls.push('host'); return {} as never },
        buildClient: async () => { calls.push('client'); return {} as never },
        ensureProfile: vi.fn(),
      },
    })
    expect(code).toBe(0)
    expect(calls).toEqual(expect.arrayContaining(['host', 'client']))
    streams.out.end(); streams.err.end()
    await expect(text(streams.out)).resolves.toContain('Built @test/plugin')
  })

  it('builds a no-op Host root artifact for an explicit Client-only project', async () => {
    const streams = io()
    const value = project()
    const { hostEntry: _hostEntry, ...clientOnlyFields } = value
    const clientOnly: ResolvedDshxConfig = clientOnlyFields
    const calls: string[] = []
    const code = await runCli(['build'], {
      io: streams,
      runtime: {
        resolveConfig: async () => clientOnly,
        checkManifest: async () => [],
        buildHost: async options => { calls.push(`host:${options.entry ?? 'stub'}`); return {} as never },
        buildClient: async () => { calls.push('client'); return {} as never },
      },
    })
    expect(code).toBe(0)
    expect(calls).toEqual(['host:stub', 'client'])
  })

  it('check emits JSON and reports absent Profile links without adding them', async () => {
    const streams = io()
    const value = project()
    const ensure = vi.fn()
    const code = await runCli(['check', '--json'], {
      io: streams,
      runtime: {
        resolveConfig: async () => value,
        checkManifest: async () => [],
        resolveDsh: async () => profile(value).dsh,
        inspectProfile: async () => ({ state: 'absent', profile: 'web', packageId: value.packageId, root: value.root }),
        ensureProfile: ensure,
      },
    })
    expect(code).toBe(1)
    expect(ensure).not.toHaveBeenCalled()
    streams.out.end(); streams.err.end()
    const output = await text(streams.out)
    expect(JSON.parse(output)).toMatchObject({ diagnostics: [{ code: 'DSHX4305', severity: 'error' }], dsh: { adapterId: 'dsh-0.1', protocolGeneration: '0.1', supportedRange: '>=0.1.0-rc.8 <0.2.0' }, runtimePlugins: [], bridge: { state: 'disabled', metadata: null } })
  })

  it('supports check --fix dry-run with a machine-readable repair summary', async () => {
    const streams = io()
    const value = project()
    const apply = vi.fn()
    const code = await runCli(['check', '--fix', '--dry-run', '--json'], {
      io: streams,
      runtime: {
        resolveConfig: async () => value,
        resolveDsh: async () => profile(value).dsh,
        inspectProfile: async () => ({ state: 'linked' as const, profile: value.profile, packageId: value.packageId, root: value.root }),
        checkManifest: async () => [],
        inspectRuntimePlugins: () => ({ plugins: [], diagnostics: [] }),
        inspectBridgeStatus: async () => ({ state: 'disabled' as const, diagnostics: [] }),
        createRepairPlan: async () => ({ root: value.root, files: [{ file: value.packageFile, before: '{}', after: '{"name":"fixed"}' }], changedFiles: [value.packageFile], diagnostics: [], diff: '--- package.json\n+++ package.json\n' }),
        applyRepairPlan: apply,
      },
    })
    expect(code).toBe(0)
    expect(apply).not.toHaveBeenCalled()
    streams.out.end(); streams.err.end()
    expect(JSON.parse(await text(streams.out))).toMatchObject({ fix: { requested: true, dryRun: true, applied: false, changedFiles: [value.packageFile] } })
  })

  it('applies a deterministic repair and rechecks the project', async () => {
    const streams = io()
    const value = project()
    const apply = vi.fn()
    const checkManifest = vi.fn(async () => [])
    const code = await runCli(['check', '--fix', '--json'], {
      io: streams,
      runtime: {
        resolveConfig: async () => value,
        resolveDsh: async () => profile(value).dsh,
        inspectProfile: async () => ({ state: 'linked' as const, profile: value.profile, packageId: value.packageId, root: value.root }),
        checkManifest,
        inspectRuntimePlugins: () => ({ plugins: [], diagnostics: [] }),
        inspectBridgeStatus: async () => ({ state: 'disabled' as const, diagnostics: [] }),
        createRepairPlan: async () => ({ root: value.root, files: [{ file: value.packageFile, before: '{}', after: '{"name":"fixed"}' }], changedFiles: [value.packageFile], diagnostics: [], diff: 'planned diff' }),
        applyRepairPlan: apply,
      },
    })
    expect(code).toBe(0)
    expect(apply).toHaveBeenCalledOnce()
    expect(checkManifest).toHaveBeenCalledTimes(3)
    streams.out.end(); streams.err.end()
    expect(JSON.parse(await text(streams.out))).toMatchObject({ fix: { requested: true, applied: true, dryRun: false } })
  })

  it('rolls back when post-fix manifest validation fails', async () => {
    const streams = io()
    const value = project()
    const rollback = vi.fn()
    let checks = 0
    const code = await runCli(['check', '--fix'], {
      io: streams,
      runtime: {
        resolveConfig: async () => value,
        resolveDsh: async () => profile(value).dsh,
        inspectProfile: async () => ({ state: 'linked' as const, profile: value.profile, packageId: value.packageId, root: value.root }),
        checkManifest: async () => {
          checks += 1
          return checks === 2 ? [{ code: 'DSHX4110', severity: 'error' as const, message: 'bad export', file: value.packageFile, hint: 'repair' }] : []
        },
        inspectRuntimePlugins: () => ({ plugins: [], diagnostics: [] }),
        inspectBridgeStatus: async () => ({ state: 'disabled' as const, diagnostics: [] }),
        createRepairPlan: async () => ({ root: value.root, files: [{ file: value.packageFile, before: '{}', after: '{"name":"fixed"}' }], changedFiles: [value.packageFile], diagnostics: [], diff: 'planned diff' }),
        applyRepairPlan: async () => undefined,
        rollbackRepairPlan: rollback,
      },
    })
    expect(code).toBe(1)
    expect(rollback).toHaveBeenCalledOnce()
    streams.out.end(); streams.err.end()
    expect(await text(streams.err)).toContain('DSHX4146')
  })

  it('check overlays loaded runtime plugin state from a running bridge', async () => {
    const streams = io()
    const value = project()
    const base = profile(value).dsh
    const dsh = {
      ...base,
      compatibility: {
        ...base.compatibility,
        runtimePlugins: [{ id: 'tool-cordis', packageName: '@deepseek-ai/dsh-tool-cordis', load: 'module' as const, provides: ['Service', 'Event'], optional: true }],
      },
    }
    const code = await runCli(['check', '--json'], {
      io: streams,
      runtime: {
        resolveConfig: async () => value,
        checkManifest: async () => [],
        resolveDsh: async () => dsh,
        inspectProfile: async () => ({ state: 'linked', profile: value.profile, packageId: value.packageId, root: value.root }),
        inspectRuntimePlugins: () => ({ plugins: [{ id: 'tool-cordis', packageName: '@deepseek-ai/dsh-tool-cordis', provides: ['Service', 'Event'], status: 'available' as const }], diagnostics: [] }),
        inspectBridgeStatus: async () => ({ state: 'running' as const, metadata: { runtimePlugins: [{ id: 'tool-cordis', packageName: '@deepseek-ai/dsh-tool-cordis', provides: ['Service', 'Event'], status: 'loaded' }] }, diagnostics: [] }),
      },
    })
    expect(code).toBe(0)
    streams.out.end(); streams.err.end()
    expect(JSON.parse(await text(streams.out))).toMatchObject({ runtimePlugins: [{ id: 'tool-cordis', status: 'loaded' }], bridge: { state: 'running' } })
  })

  it('blocks dev before profile linking when manifest has errors', async () => {
    const streams = io()
    const ensure = vi.fn()
    const code = await runCli(['dev'], {
      io: streams,
      runtime: {
        resolveConfig: async () => project(),
        checkManifest: async () => [{ code: 'DSHX4110', severity: 'error', message: 'bad export', file: '/project/plugin/package.json', hint: 'fix it' }],
        ensureProfile: ensure,
      },
    })
    expect(code).toBe(1)
    expect(ensure).not.toHaveBeenCalled()
  })

  it('passes the prepared Profile into dev and exits on non-TTY DSH failure', async () => {
    const streams = io()
    const value = project()
    let received: unknown
    const fakeSession: DevSession = {
      state: { hostBuild: 'building', clientBuild: 'building', hostRestartRequired: false, dshProcess: 'stopped' },
      diagnostics: [],
      on(listenerOrEvent: string | ((event: DevEvent) => void), listener?: (event: DevEvent) => void) {
        const handler = typeof listenerOrEvent === 'function' ? listenerOrEvent : listener!
        queueMicrotask(() => handler({ type: 'dsh-exit', code: 1, signal: null, diagnostic: { code: 'DSHX4402', severity: 'error', message: 'exit', file: value.packageFile, hint: 'restart' } }))
        return () => undefined
      },
      restart: async () => undefined,
      close: async () => undefined,
    }
    const prepared = profile(value)
    const code = await runCli(['dev'], {
      io: streams,
      runtime: {
        resolveConfig: async () => value,
        checkManifest: async () => [],
        ensureProfile: async () => prepared,
        startDev: async (_project, options) => { received = options?.preparedProfile; return fakeSession },
      },
    })
    expect(code).toBe(1)
    expect(received).toBe(prepared)
  })

  it('inspects runtime slots as clean JSON without linking the Profile', async () => {
    const streams = io()
    const value = project()
    const ensure = vi.fn()
    const code = await runCli(['inspect', 'slots', '--json'], {
      io: streams,
      runtime: {
        resolveConfig: async () => value,
        inspectComposition: async (_project, target) => ({
          profile: 'web', target, source: 'runtime',
          items: [{ name: 'sidebar.footer.action', provider: '@provider/sidebar', kind: 'action', scope: 'global', metadata: { order: 10 } }],
          diagnostics: [],
        }),
        ensureProfile: ensure,
      },
    })
    expect(code).toBe(0)
    expect(ensure).not.toHaveBeenCalled()
    streams.out.end(); streams.err.end()
    const output = JSON.parse(await text(streams.out)) as Record<string, unknown>
    expect(output).toMatchObject({ target: 'slots', source: 'runtime', project: { packageId: value.packageId } })
    expect(output.items).toEqual([{ name: 'sidebar.footer.action', provider: '@provider/sidebar', kind: 'action', scope: 'global', metadata: { order: 10 } }])
    expect(await text(streams.err)).toBe('')
  })

  it('forwards an exact Slot root to the Inspect runtime', async () => {
    const streams = io()
    const value = project()
    const inspectComposition = vi.fn(async (_project: ResolvedDshxConfig, target: InspectTarget, options?: InspectOptions) => ({
      profile: 'web' as const, target, source: 'runtime' as const,
      items: [{ name: options?.slotRoot ?? 'sidebar', kind: 'list', scope: 'root' }], diagnostics: [],
    } as const))
    const code = await runCli(['inspect', 'slots', '--root', 'sidebar.footer.action', '--json'], {
      io: streams,
      runtime: { resolveConfig: async () => value, inspectComposition },
    })
    expect(code).toBe(0)
    expect(inspectComposition).toHaveBeenCalledWith(value, 'slots', { slotRoot: 'sidebar.footer.action' })
    streams.out.end(); streams.err.end()
    expect(JSON.parse(await text(streams.out))).toMatchObject({ target: 'slots', items: [{ name: 'sidebar.footer.action' }] })
  })

  it('reports an unavailable runtime provider with a non-zero inspect result', async () => {
    const streams = io()
    const value = project()
    const code = await runCli(['inspect', 'tools'], {
      io: streams,
      runtime: {
        resolveConfig: async () => value,
        inspectComposition: async (_project, target) => ({ profile: 'web', target, source: 'runtime', items: [], diagnostics: [{ code: 'DSHX3201', severity: 'error', message: 'No provider', file: value.packageFile, hint: 'Start DSH.' }] }),
      },
    })
    expect(code).toBe(1)
    streams.out.end(); streams.err.end()
    expect(await text(streams.out)).toContain('Inspect tools')
    expect(await text(streams.err)).toContain('DSHX3201')
  })

  it('prints service summaries as JSON and keeps Inspect read-only', async () => {
    const streams = io()
    const value = project()
    const ensure = vi.fn()
    const code = await runCli(['inspect', 'services', '--json'], {
      io: streams,
      runtime: {
        resolveConfig: async () => value,
        inspectComposition: async (_project, target) => ({ profile: 'web', target, source: 'runtime', items: [{ name: 'logger', provider: 'core', scope: 'global' }], diagnostics: [] }),
        ensureProfile: ensure,
      },
    })
    expect(code).toBe(0)
    expect(ensure).not.toHaveBeenCalled()
    streams.out.end(); streams.err.end()
    expect(JSON.parse(await text(streams.out))).toMatchObject({ target: 'services', source: 'runtime', items: [{ name: 'logger', scope: 'global' }] })
    expect(await text(streams.err)).toBe('')
  })

  it('reports unsupported events and prints verbose provider causes to stderr', async () => {
    const streams = io()
    const value = project()
    const cause = Object.assign(new Error('provider failed'), { cause: { stderr: 'connection refused' } })
    const code = await runCli(['inspect', 'events', '--verbose'], {
      io: streams,
      runtime: {
        resolveConfig: async () => value,
        inspectComposition: async (_project, target) => ({ profile: 'web', target, source: 'runtime', items: [], diagnostics: [{ code: 'DSHX3204', severity: 'error', message: 'Unsupported', file: value.packageFile, hint: 'Use a supported adapter.' }], cause }),
      },
    })
    expect(code).toBe(1)
    streams.out.end(); streams.err.end()
    expect(await text(streams.out)).toContain('Inspect events')
    const errorOutput = await text(streams.err)
    expect(errorOutput).toContain('DSHX3204')
    expect(errorOutput).toContain('connection refused')
  })

  it('requires a Slot in non-TTY add ui mode without invoking the generator', async () => {
    const streams = io()
    const value = project()
    const addUi = vi.fn()
    const code = await runCli(['add', 'ui'], {
      io: streams,
      runtime: { resolveConfig: async () => value, addUi },
    })
    expect(code).toBe(2)
    expect(addUi).not.toHaveBeenCalled()
    streams.out.end(); streams.err.end()
    expect(await text(streams.err)).toContain('DSHX6101')
  })

  it('requires a Tool name in non-TTY add tool mode without invoking the generator', async () => {
    const streams = io()
    const value = project()
    const addTool = vi.fn()
    const code = await runCli(['add', 'tool'], { io: streams, runtime: { resolveConfig: async () => value, addTool } })
    expect(code).toBe(2)
    expect(addTool).not.toHaveBeenCalled()
    streams.out.end(); streams.err.end()
    expect(await text(streams.err)).toContain('DSHX6201')
  })

  it('requires a Command name in non-TTY add command mode without invoking the generator', async () => {
    const streams = io()
    const value = project()
    const addCommand = vi.fn()
    const code = await runCli(['add', 'command'], { io: streams, runtime: { resolveConfig: async () => value, addCommand } })
    expect(code).toBe(2)
    expect(addCommand).not.toHaveBeenCalled()
    streams.out.end(); streams.err.end()
    expect(await text(streams.err)).toContain('DSHX6501')
  })
})
