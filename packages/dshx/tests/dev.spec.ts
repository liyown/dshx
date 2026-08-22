import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { RC8_COMPATIBILITY } from '../src/compat/index.js'
import type { ResolvedDshxConfig } from '../src/config/index.js'
import { startDevSession } from '../src/dev/index.js'
import type { DevBuildEvent, DevChildProcess, DevEvent, DevWatcher } from '../src/dev/index.js'
import type { PreparedProjectProfile } from '../src/profile/index.js'

class FakeWatcher extends EventEmitter implements DevWatcher {
  close = vi.fn(async () => undefined)

  override on(event: 'event', listener: (event: DevBuildEvent) => void): this {
    return super.on(event, listener)
  }

  build(event: DevBuildEvent): void {
    this.emit('event', event)
  }
}

class FakeChild extends EventEmitter implements DevChildProcess {
  readonly signals: NodeJS.Signals[] = []

  constructor(private readonly exitOnTerm = true) {
    super()
  }

  override on(event: 'exit', listener: (code: number | null, signal: string | null) => void): this
  override on(event: 'error', listener: (error: unknown) => void): this
  override on(event: 'exit' | 'error', listener: ((code: number | null, signal: string | null) => void) | ((error: unknown) => void)): this {
    return super.on(event, listener)
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.signals.push(signal)
    if (signal === 'SIGTERM' && this.exitOnTerm) this.emit('exit', null, signal)
    return true
  }

  exit(code: number | null, signal: string | null = null): void {
    this.emit('exit', code, signal)
  }
}

function project(faces: 'host' | 'client' | 'full' = 'full', hostRestart: 'manual' | 'auto' = 'manual'): ResolvedDshxConfig {
  const root = '/project/plugin'
  return {
    root,
    packageFile: `${root}/package.json`,
    configDependencies: [],
    packageId: '@test/plugin',
    name: '@test/plugin',
    ...(faces === 'client' ? {} : { hostEntry: `${root}/src/host.ts` }),
    ...(faces === 'host' ? {} : { clientEntry: `${root}/src/client.tsx` }),
    outDir: `${root}/dist`,
    profile: 'web',
    dev: { hostRestart },
    build: { sourcemap: true },
    compatibility: { allowUnsupported: false },
    manifest: { name: '@test/plugin', type: 'module' },
  }
}

function prepared(projectValue: ResolvedDshxConfig): PreparedProjectProfile {
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
      compatibility: RC8_COMPATIBILITY,
    },
  }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('development process orchestration', () => {
  it.each([
    ['host', 'hostBuild', 'clientBuild'],
    ['client', 'clientBuild', 'hostBuild'],
  ] as const)('starts a %s-only project after its enabled face builds', async (faces, active, idle) => {
    const projectValue = project(faces)
    const watcher = new FakeWatcher()
    const children: FakeChild[] = []
    const session = await startDevSession(projectValue, {
      ensureProfile: async () => prepared(projectValue),
      ...(faces === 'host' ? { hostWatcher: async () => watcher } : { clientWatcher: async () => watcher }),
      child: async () => {
        const child = new FakeChild()
        children.push(child)
        return child
      },
    })

    expect(session.state[active]).toBe('building')
    expect(session.state[idle]).toBe('idle')
    expect(children).toHaveLength(0)
    watcher.build({ code: 'BUNDLE_END' })
    await flush()
    expect(session.state.dshProcess).toBe('running')
    expect(children).toHaveLength(1)
    await session.close()
  })

  it('keeps both watchers alive after an initial error and starts once both faces have succeeded', async () => {
    const projectValue = project()
    const host = new FakeWatcher()
    const client = new FakeWatcher()
    const childFactory = vi.fn(async () => new FakeChild())
    const events: DevEvent[] = []
    const session = await startDevSession(projectValue, {
      ensureProfile: async () => prepared(projectValue),
      hostWatcher: async () => host,
      clientWatcher: async () => client,
      child: childFactory,
    })
    session.on(event => events.push(event))

    host.build({ code: 'ERROR', error: new Error('invalid host') })
    client.build({ code: 'BUNDLE_END' })
    await flush()
    expect(session.state).toMatchObject({ hostBuild: 'error', clientBuild: 'ok', dshProcess: 'stopped' })
    expect(childFactory).not.toHaveBeenCalled()
    expect(events).toContainEqual(expect.objectContaining({ type: 'build-error', face: 'host' }))

    host.build({ code: 'START' })
    host.build({ code: 'BUNDLE_END' })
    await flush()
    expect(session.state).toMatchObject({ hostBuild: 'ok', clientBuild: 'ok', dshProcess: 'running' })
    expect(childFactory).toHaveBeenCalledTimes(1)
    expect(host.close).not.toHaveBeenCalled()
    await session.close()
  })

  it('uses native Client reload behavior without restarting DSH', async () => {
    const projectValue = project('client')
    const client = new FakeWatcher()
    const childFactory = vi.fn(async () => new FakeChild())
    const rebuilt = vi.fn()
    const session = await startDevSession(projectValue, {
      ensureProfile: async () => prepared(projectValue),
      clientWatcher: async () => client,
      child: childFactory,
    })
    session.on('client-rebuilt', rebuilt)
    client.build({ code: 'BUNDLE_END' })
    await flush()
    client.build({ code: 'BUNDLE_END' })
    await flush()
    expect(rebuilt).toHaveBeenCalledTimes(1)
    expect(childFactory).toHaveBeenCalledTimes(1)
    expect(session.state.dshProcess).toBe('running')
    await session.close()
  })

  it('marks manual Host rebuilds and clears the flag after an explicit restart', async () => {
    const projectValue = project('host')
    const host = new FakeWatcher()
    const children: FakeChild[] = []
    const session = await startDevSession(projectValue, {
      ensureProfile: async () => prepared(projectValue),
      hostWatcher: async () => host,
      child: async () => {
        const child = new FakeChild()
        children.push(child)
        return child
      },
    })
    host.build({ code: 'BUNDLE_END' })
    await flush()
    host.build({ code: 'BUNDLE_END' })
    await flush()
    expect(session.state.hostRestartRequired).toBe(true)
    expect(children).toHaveLength(1)

    await session.restart()
    expect(children[0]?.signals).toEqual(['SIGTERM'])
    expect(children).toHaveLength(2)
    expect(session.state).toMatchObject({ hostRestartRequired: false, dshProcess: 'running' })
    await session.close()
  })

  it('serializes automatic Host restarts', async () => {
    const projectValue = project('host', 'auto')
    const host = new FakeWatcher()
    const children: FakeChild[] = []
    const session = await startDevSession(projectValue, {
      ensureProfile: async () => prepared(projectValue),
      hostWatcher: async () => host,
      child: async () => {
        const child = new FakeChild()
        children.push(child)
        return child
      },
    })
    host.build({ code: 'BUNDLE_END' })
    await flush()
    host.build({ code: 'BUNDLE_END' })
    host.build({ code: 'BUNDLE_END' })
    await flush()
    await flush()
    expect(children.length).toBeGreaterThanOrEqual(2)
    expect(children.slice(0, -1).every(child => child.signals.includes('SIGTERM'))).toBe(true)
    expect(session.state.dshProcess).toBe('running')
    await session.close()
  })

  it('passes profile, no-open, extra arguments, cwd project and merged environment', async () => {
    const projectValue: ResolvedDshxConfig = {
      ...project(),
      manifest: {
        name: '@test/plugin',
        dsh: { client: { external: ['@test/runtime'] } },
      },
    }
    const host = new FakeWatcher()
    const client = new FakeWatcher()
    const calls: Array<{ project: ResolvedDshxConfig; args: readonly string[]; env: NodeJS.ProcessEnv }> = []
    const session = await startDevSession(projectValue, {
      env: { DSH_HOME: '/isolated/home' },
      dshArgs: ['--port', '4321'],
      ensureProfile: async (_project, profileOptions) => {
        expect(profileOptions.env?.DSH_HOME).toBe('/isolated/home')
        return prepared(projectValue)
      },
      hostWatcher: async options => {
        expect(options).toMatchObject({ root: projectValue.root, entry: projectValue.hostEntry, outDir: projectValue.outDir, logicalName: projectValue.name, watch: true })
        return host
      },
      clientWatcher: async options => {
        expect(options).toMatchObject({ root: projectValue.root, entry: projectValue.clientEntry, watch: true, external: ['@test/runtime'] })
        return client
      },
      child: async (childProject, args, env) => {
        calls.push({ project: childProject, args, env })
        return new FakeChild()
      },
    })
    host.build({ code: 'BUNDLE_END' })
    client.build({ code: 'BUNDLE_END' })
    await flush()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.project.root).toBe(projectValue.root)
    expect(calls[0]?.args).toEqual(['--profile', 'web', '--no-open', '--port', '4321'])
    expect(calls[0]?.env.DSH_HOME).toBe('/isolated/home')
    await session.close()
  })

  it('treats --open as a DSHX policy flag without forwarding it to DSH', async () => {
    const projectValue = project('host')
    const host = new FakeWatcher()
    const calls: string[][] = []
    const session = await startDevSession(projectValue, {
      dshArgs: ['--open'],
      ensureProfile: async () => prepared(projectValue),
      hostWatcher: async () => host,
      child: async (_project, args) => {
        calls.push([...args])
        return new FakeChild()
      },
    })
    host.build({ code: 'BUNDLE_END' })
    await flush()
    expect(calls).toEqual([['--profile', 'web']])
    await session.close()
  })

  it.each([
    [1, null, 'DSHX4402'],
    [null, 'SIGABRT', 'DSHX4403'],
  ] as const)('reports an unexpected DSH exit without restarting it', async (code, signal, expectedCode) => {
    const projectValue = project('host')
    const host = new FakeWatcher()
    const child = new FakeChild()
    const childFactory = vi.fn(async () => child)
    const session = await startDevSession(projectValue, {
      ensureProfile: async () => prepared(projectValue),
      hostWatcher: async () => host,
      child: childFactory,
    })
    host.build({ code: 'BUNDLE_END' })
    await flush()
    child.exit(code, signal)
    expect(session.state.dshProcess).toBe('failed')
    expect(session.diagnostics.at(-1)?.code).toBe(expectedCode)
    expect(childFactory).toHaveBeenCalledTimes(1)
    host.build({ code: 'BUNDLE_END' })
    await flush()
    expect(childFactory).toHaveBeenCalledTimes(1)
    expect(session.state.dshProcess).toBe('failed')
    await session.close()
  })

  it('maps initial spawn and later restart failures to distinct diagnostics', async () => {
    const projectValue = project('host')
    const host = new FakeWatcher()
    const first = new FakeChild()
    let calls = 0
    const session = await startDevSession(projectValue, {
      ensureProfile: async () => prepared(projectValue),
      hostWatcher: async () => host,
      child: async () => {
        calls += 1
        if (calls === 1) throw new Error('spawn unavailable')
        if (calls === 3) throw new Error('restart unavailable')
        return first
      },
    })
    host.build({ code: 'BUNDLE_END' })
    await flush()
    expect(session.state.dshProcess).toBe('failed')
    expect(session.diagnostics.at(-1)?.code).toBe('DSHX4401')
    await session.restart()
    expect(session.state.dshProcess).toBe('running')
    await session.restart()
    expect(session.state.dshProcess).toBe('failed')
    expect(session.diagnostics.at(-1)?.code).toBe('DSHX4404')
    await session.close()
  })

  it('closes watchers before the child, escalates after timeout, and ignores later events', async () => {
    const projectValue = project()
    const host = new FakeWatcher()
    const client = new FakeWatcher()
    const child = new FakeChild(false)
    const session = await startDevSession(projectValue, {
      stopTimeoutMs: 1,
      ensureProfile: async () => prepared(projectValue),
      hostWatcher: async () => host,
      clientWatcher: async () => client,
      child: async () => child,
    })
    host.build({ code: 'BUNDLE_END' })
    client.build({ code: 'BUNDLE_END' })
    await flush()
    await session.close()
    await session.close()
    expect(host.close).toHaveBeenCalledTimes(1)
    expect(client.close).toHaveBeenCalledTimes(1)
    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL'])
    const closedState = session.state
    host.build({ code: 'ERROR', error: new Error('late') })
    child.exit(1)
    expect(session.state).toBe(closedState)
    expect(session.state.dshProcess).toBe('stopped')
  })

  it('waits for an in-flight child factory and stops the late child before close resolves', async () => {
    const projectValue = project('host')
    const host = new FakeWatcher()
    const lateChild = new FakeChild()
    let resolveChild: ((child: DevChildProcess) => void) | undefined
    const pendingChild = new Promise<DevChildProcess>(resolve => { resolveChild = resolve })
    const session = await startDevSession(projectValue, {
      ensureProfile: async () => prepared(projectValue),
      hostWatcher: async () => host,
      child: async () => pendingChild,
    })
    host.build({ code: 'BUNDLE_END' })
    await flush()
    expect(session.state.dshProcess).toBe('starting')

    let closeResolved = false
    const closing = session.close().then(() => { closeResolved = true })
    await flush()
    expect(closeResolved).toBe(false)
    resolveChild?.(lateChild)
    await closing
    expect(lateChild.signals).toEqual(['SIGTERM'])
    expect(session.state.dshProcess).toBe('stopped')
  })

  it('closes an already-created watcher when a later watcher cannot start', async () => {
    const projectValue = project()
    const host = new FakeWatcher()
    await expect(startDevSession(projectValue, {
      ensureProfile: async () => prepared(projectValue),
      hostWatcher: async () => host,
      clientWatcher: async () => { throw new Error('watch unavailable') },
    })).rejects.toMatchObject({ code: 'DSHX4405' })
    expect(host.close).toHaveBeenCalledTimes(1)
  })

  it('retains compatibility warnings returned by the Profile Orchestrator', async () => {
    const projectValue = project('host')
    const host = new FakeWatcher()
    const warning = {
      code: 'DSHX5101',
      severity: 'warning' as const,
      message: 'unsupported version',
      file: projectValue.packageFile,
      hint: 'use rc.8',
    }
    const profile = prepared(projectValue)
    const session = await startDevSession(projectValue, {
      ensureProfile: async () => ({ ...profile, diagnostics: [warning] }),
      hostWatcher: async () => host,
      child: async () => new FakeChild(),
    })
    expect(session.diagnostics).toEqual([warning])
    await session.close()
  })
})
