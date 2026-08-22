import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { parseCliArgs } from '../src/cli/args.js'
import { runCli } from '../src/cli/run.js'
import type { CliIO } from '../src/cli/run.js'
import type { DevEvent, DevSession } from '../src/dev/index.js'
import type { ResolvedDshxConfig } from '../src/config/index.js'
import type { PreparedProjectProfile } from '../src/profile/index.js'

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
  })

  it('rejects unknown arguments and invalid option combinations', () => {
    expect(() => parseCliArgs([])).toThrow('A command is required')
    expect(() => parseCliArgs(['build', '--json'])).toThrow('--json')
    expect(() => parseCliArgs(['dev', '--cwd'])).toThrow('requires a value')
    expect(() => parseCliArgs(['wat'])).toThrow('Unknown argument')
    expect(() => parseCliArgs(['inspect'])).toThrow('requires a target')
    expect(() => parseCliArgs(['inspect', 'services'])).toThrow('Unknown argument')
    expect(() => parseCliArgs(['build', 'slots'])).toThrow('only valid with the inspect command')
  })

  it('parses inspect targets and JSON mode', () => {
    expect(parseCliArgs(['inspect', 'slots', '--json'])).toMatchObject({ command: 'inspect', inspectTarget: 'slots', json: true })
    expect(parseCliArgs(['inspect', 'tools', '--verbose', '--cwd', '/tmp/project'])).toMatchObject({ command: 'inspect', inspectTarget: 'tools', verbose: true, cwd: '/tmp/project' })
  })

  it('parses add ui options and rejects non-ui add targets', () => {
    expect(parseCliArgs(['add', 'ui', '--slot', 'sidebar.footer.action', '--provider', '@provider/sidebar', '--order', '2', '--dry-run', '--json'])).toMatchObject({
      command: 'add', addTarget: 'ui', slot: 'sidebar.footer.action', provider: '@provider/sidebar', order: 2, dryRun: true, json: true,
    })
    expect(() => parseCliArgs(['add'])).toThrow('requires a target')
    expect(parseCliArgs(['add', 'tool'])).toMatchObject({ command: 'add', addTarget: 'tool' })
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
    expect(JSON.parse(output)).toMatchObject({ diagnostics: [{ code: 'DSHX4305', severity: 'error' }], dsh: { adapterId: 'dsh-0.1', protocolGeneration: '0.1', supportedRange: '>=0.1.0-rc.8 <0.2.0' } })
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
})
