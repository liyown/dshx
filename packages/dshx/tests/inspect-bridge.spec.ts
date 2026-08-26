import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DshInspectBridgeProvider, inspectBridgeStatus } from '../src/inspect/bridge.js'
import type { ResolvedDshxConfig } from '../src/config/types.js'

const project: ResolvedDshxConfig = {
  root: '/project',
  packageFile: '/project/package.json',
  configFile: '/project/dshx.config.ts',
  configDependencies: [],
  packageId: 'demo',
  name: 'demo',
  outDir: '/project/dist',
  profile: 'web',
  dev: { hostRestart: 'manual' },
  build: { sourcemap: true },
  compatibility: { allowUnsupported: false },
  manifest: { name: 'demo' },
}

const tempRoots: string[] = []

async function endpoint(envRoot: string, response: string): Promise<() => Promise<void>> {
  const directory = join(envRoot, 'runtime', 'dshx', 'inspect')
  await mkdir(directory, { recursive: true })
  const name = createHash('sha256').update(project.packageId).digest('hex').slice(0, 20)
  const socketPath = join(directory, `${name}.sock`)
  const metadataPath = join(directory, `${name}.json`)
  const server = createServer(socket => socket.once('data', () => socket.end(`${response}\n`)))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, resolve)
  })
  await writeFile(
    metadataPath,
    JSON.stringify({ version: 1, packageId: project.packageId, root: project.root, pid: process.pid, socketPath, token: randomUUID() }) + '\n',
  )
  return async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(envRoot, { recursive: true, force: true })
  }
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('DshInspectBridgeProvider', () => {
  it('connects to the Host-owned socket and validates bridge DTOs', async () => {
    const root = await mkdtemp(join('/tmp', 'dx-'))
    tempRoots.push(root)
    const directory = join(root, 'runtime', 'dshx', 'inspect')
    await mkdir(directory, { recursive: true })
    const name = createHash('sha256').update(project.packageId).digest('hex').slice(0, 20)
    const socketPath = join(directory, `${name}.sock`)
    const metadataPath = join(directory, `${name}.json`)
    const server = createServer(socket => {
      socket.once('data', data => {
        const request = JSON.parse(data.toString()) as { requestId: string; target: string }
        socket.end(
          JSON.stringify({
            version: 1,
            requestId: request.requestId,
            ok: true,
            target: request.target,
            items: [{ name: 'logger', provider: 'Service', scope: 'composition' }],
          }) + '\n',
        )
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, resolve)
    })
    await writeFile(
      metadataPath,
      JSON.stringify({ version: 1, packageId: project.packageId, root: project.root, pid: process.pid, socketPath, token: randomUUID() }) + '\n',
    )
    const provider = new DshInspectBridgeProvider(project, { env: { DSH_HOME: root } })
    await expect(provider.listServices()).resolves.toEqual([{ name: 'logger', provider: 'Service', scope: 'composition' }])
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  it('reports a running bridge without exposing its authentication token', async () => {
    const root = await mkdtemp(join('/tmp', 'dx-'))
    tempRoots.push(root)
    const close = await endpoint(root, JSON.stringify({ version: 1, requestId: 'unused', ok: true, target: 'services', items: [] }))
    const status = await inspectBridgeStatus(project, { env: { DSH_HOME: root } })
    expect(status.state).toBe('running')
    expect(status.metadata).toBeDefined()
    expect(status.metadata).not.toHaveProperty('token')
    await close()
  })

  it('reports stale bridge metadata without connecting to a process', async () => {
    const root = await mkdtemp(join('/tmp', 'dx-'))
    tempRoots.push(root)
    const directory = join(root, 'runtime', 'dshx', 'inspect')
    await mkdir(directory, { recursive: true })
    const name = createHash('sha256').update(project.packageId).digest('hex').slice(0, 20)
    const socketPath = join(directory, `${name}.sock`)
    const metadataPath = join(directory, `${name}.json`)
    await writeFile(
      metadataPath,
      JSON.stringify({ version: 1, packageId: project.packageId, root: project.root, pid: 99999999, socketPath, token: randomUUID() }) + '\n',
    )
    const status = await inspectBridgeStatus(project, { env: { DSH_HOME: root } })
    expect(status.state).toBe('stale')
    expect(status.diagnostics[0]).toMatchObject({ code: 'DSHX5103', severity: 'warning' })
  })

  it('maps missing endpoints and malformed responses to stable diagnostics', async () => {
    const root = await mkdtemp(join('/tmp', 'dx-'))
    tempRoots.push(root)
    const missing = new DshInspectBridgeProvider(project, { env: { DSH_HOME: root } })
    await expect(missing.listEvents()).rejects.toMatchObject({ code: 'DSHX3201' })
    const close = await endpoint(root, '{bad')
    const malformed = new DshInspectBridgeProvider(project, { env: { DSH_HOME: root } })
    await expect(malformed.listEvents()).rejects.toMatchObject({ code: 'DSHX3203' })
    await close()
  })

  it('queries compact and exact Client Slot contracts through the Host bridge', async () => {
    const root = await mkdtemp(join('/tmp', 'dx-'))
    tempRoots.push(root)
    const directory = join(root, 'runtime', 'dshx', 'inspect')
    await mkdir(directory, { recursive: true })
    const name = createHash('sha256').update(project.packageId).digest('hex').slice(0, 20)
    const socketPath = join(directory, `${name}.sock`)
    const metadataPath = join(directory, `${name}.json`)
    const server = createServer(socket => {
      socket.once('data', data => {
        const request = JSON.parse(data.toString()) as { requestId: string; target: string; input?: { root?: string } }
        const exact = request.input?.root !== undefined
        const value = exact
          ? [
              {
                name: request.input?.root,
                kind: 'list',
                scope: 'root',
                metadata: {
                  catalog: { registration: [{ name: 'id', required: true, type: 'string' }], replaceRisk: 'none', ownerProps: [], standardProps: [] },
                  occupants: [],
                },
              },
            ]
          : [
              {
                name: 'sidebar',
                kind: 'single',
                scope: 'root',
                metadata: { purpose: 'Sidebar', children: [{ name: 'sidebar.footer.action', kind: 'list', scope: 'root', purpose: 'Footer action' }] },
              },
              { name: 'sidebar.footer.action', kind: 'list', scope: 'root', metadata: { purpose: 'Footer action', children: [] } },
            ]
        socket.end(JSON.stringify({ version: 1, requestId: request.requestId, ok: true, target: request.target, items: value }) + '\n')
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, resolve)
    })
    await writeFile(
      metadataPath,
      JSON.stringify({ version: 1, packageId: project.packageId, root: project.root, pid: process.pid, socketPath, token: randomUUID() }) + '\n',
    )
    const provider = new DshInspectBridgeProvider(project, { env: { DSH_HOME: root } })
    await expect(provider.listSlots()).resolves.toEqual([
      {
        name: 'sidebar',
        kind: 'single',
        scope: 'root',
        metadata: { purpose: 'Sidebar', children: [{ name: 'sidebar.footer.action', kind: 'list', scope: 'root', purpose: 'Footer action' }] },
      },
      { name: 'sidebar.footer.action', kind: 'list', scope: 'root', metadata: { purpose: 'Footer action', children: [] } },
    ])
    await expect(provider.listSlots({ root: 'sidebar.footer.action' })).resolves.toMatchObject([
      {
        name: 'sidebar.footer.action',
        kind: 'list',
        scope: 'root',
        metadata: { catalog: { replaceRisk: 'none' }, occupants: [] },
      },
    ])
    await expect(provider.listTools()).rejects.toMatchObject({ code: 'DSHX3204' })
    await new Promise<void>(resolve => server.close(() => resolve()))
  })
})
