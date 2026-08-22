import { randomUUID, createHash } from 'node:crypto'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import process from 'node:process'
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { RuntimePluginStatus } from './runtime-plugins.js'

const PROTOCOL_VERSION = 1
const MAX_MESSAGE_BYTES = 64 * 1024
const REQUEST_TIMEOUT_MS = 10_000

function runtimeProcess(): NodeJS.Process | undefined {
  return process
}

export type HostInspectTarget = 'services' | 'events' | 'slots'

export interface HostInspectBridgeMetadata {
  readonly packageId: string
  readonly root: string
  readonly logicalName?: string
  readonly runtimePlugins?: readonly RuntimePluginStatus[]
}

export interface HostInspectBridgeHandle {
  readonly metadataPath: string
  readonly socketPath: string
  readonly close: () => Promise<void>
}

interface InspectRegistry {
  list(): readonly { id?: unknown }[]
  query(
    platform: 'host' | 'client',
    provider: string,
    method: string,
    input: unknown,
    agent: unknown,
    signal: AbortSignal,
  ): Promise<unknown>
}

interface AgentRegistry {
  create(options: { sessionId: string; meta: { cwd: string } }): Promise<{ agent: unknown; dispose(): Promise<void> }>
}

interface BridgeRequest {
  readonly version?: unknown
  readonly requestId?: unknown
  readonly token?: unknown
  readonly operation?: unknown
  readonly target?: unknown
  readonly input?: unknown
}

interface BridgeResponse {
  readonly version: 1
  readonly requestId: string
  readonly ok: boolean
  readonly target: HostInspectTarget
  readonly items?: readonly Record<string, unknown>[]
  readonly error?: { readonly code: string; readonly message: string }
}

class BridgeFailure extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function runtimeHome(): string {
  const configured = runtimeProcess()?.env.DSH_HOME
  return configured === undefined || configured.trim() === '' ? join(homedir(), '.dsh') : resolve(configured)
}

function bridgeName(packageId: string): string {
  return createHash('sha256').update(packageId).digest('hex').slice(0, 20)
}

function paths(packageId: string): { directory: string; socketPath: string; metadataPath: string } {
  const home = runtimeHome()
  const directory = join(home, 'runtime', 'dshx', 'inspect')
  const name = bridgeName(packageId)
  const regularSocket = join(directory, `${name}.sock`)
  // macOS limits AF_UNIX paths to roughly 104 bytes. Keep metadata in DSH_HOME
  // but use a deterministic short socket path when an isolated home is deep.
  const socketPath = regularSocket.length > 90
    ? join(tmpdir(), `dshx-${createHash('sha256').update(`${home}:${packageId}`).digest('hex').slice(0, 24)}.sock`)
    : regularSocket
  return { directory, socketPath, metadataPath: join(directory, `${name}.json`) }
}

async function removeStaleEndpoint(location: { socketPath: string; metadataPath: string }): Promise<void> {
  let value: Record<string, unknown> | undefined
  try {
    value = JSON.parse(await readFile(location.metadataPath, 'utf8')) as Record<string, unknown>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') value = undefined
  }
  if (typeof value?.pid === 'number' && Number.isInteger(value.pid)) {
    try {
      runtimeProcess()?.kill(value.pid, 0)
      throw new Error(`An active DSHX Inspect bridge already owns ${location.metadataPath}.`)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('An active DSHX')) throw error
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }
  await rm(location.socketPath, { force: true })
  await rm(location.metadataPath, { force: true })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function responseError(requestId: string, target: HostInspectTarget, code: string, message: string): BridgeResponse {
  return { version: PROTOCOL_VERSION, requestId, ok: false, target, error: { code, message } }
}

function parseRequest(text: string, token: string): { requestId: string; target: HostInspectTarget; input?: Record<string, unknown> } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new BridgeFailure('DSHX3203', 'Inspect bridge received invalid JSON.')
  }
  if (!isRecord(value)) throw new BridgeFailure('DSHX3203', 'Inspect bridge request must be an object.')
  const request = value as BridgeRequest
  if (request.version !== PROTOCOL_VERSION || typeof request.requestId !== 'string' || request.requestId === '') {
    throw new BridgeFailure('DSHX3203', 'Inspect bridge request has an invalid protocol header.')
  }
  if (request.token !== token) throw new BridgeFailure('DSHX3202', 'Inspect bridge authentication failed.')
  if (request.operation !== 'list' || (request.target !== 'services' && request.target !== 'events' && request.target !== 'slots')) {
    throw new BridgeFailure('DSHX3204', 'Inspect bridge only supports list operations for services, events, and slots.')
  }
  if (request.target !== 'slots' && request.input !== undefined) throw new BridgeFailure('DSHX3204', 'Inspect bridge input is only supported for Slot tree queries.')
  if (request.target === 'slots' && request.input !== undefined) {
    if (!isRecord(request.input) || Object.keys(request.input).some(key => key !== 'root') || (request.input.root !== undefined && (typeof request.input.root !== 'string' || request.input.root.trim() === ''))) {
      throw new BridgeFailure('DSHX3203', 'Slot Inspect input must be an object containing an optional non-empty root string.')
    }
    return { requestId: request.requestId, target: request.target, input: request.input }
  }
  return { requestId: request.requestId, target: request.target }
}

function catalogItems(target: HostInspectTarget, value: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(value)) throw new BridgeFailure('DSHX3203', 'Inspect provider returned a non-object catalog.')
  const field = target === 'services' ? 'services' : 'events'
  const entries = value[field]
  if (!Array.isArray(entries)) throw new BridgeFailure('DSHX3203', `Inspect provider catalog is missing ${field}.`)
  return entries.map((entry) => {
    if (!isRecord(entry)) throw new BridgeFailure('DSHX3203', `Inspect provider returned an invalid ${field} item.`)
    const key = target === 'services' ? entry.key : entry.name
    if (typeof key !== 'string' || key.trim() === '') throw new BridgeFailure('DSHX3203', `Inspect provider returned an item without a valid ${target === 'services' ? 'key' : 'name'}.`)
    const { key: _key, name: _name, metadata: nestedMetadata, ...metadata } = entry
    let combinedMetadata: Record<string, unknown> = isRecord(nestedMetadata) ? { ...nestedMetadata, ...metadata } : {
      ...metadata,
      ...(nestedMetadata === undefined ? {} : { metadata: nestedMetadata }),
    }
    while (Object.keys(combinedMetadata).length === 1 && isRecord(combinedMetadata.metadata)) {
      combinedMetadata = combinedMetadata.metadata
    }
    return {
      name: key,
      provider: target === 'services' ? 'Service' : 'Event',
      ...(Object.keys(combinedMetadata).length === 0 ? {} : { metadata: combinedMetadata }),
    }
  })
}

function slotNode(node: unknown): Record<string, unknown> {
  if (!isRecord(node) || typeof node.name !== 'string' || node.name.trim() === '' || typeof node.kind !== 'string' || node.kind.trim() === '' || typeof node.scope !== 'string' || node.scope.trim() === '') {
    throw new BridgeFailure('DSHX3203', 'Slot Inspect returned a tree item without valid name, kind, and scope fields.')
  }
  if (
    node.children !== undefined
    && (!Array.isArray(node.children) || node.children.some(child => !isRecord(child)))
  ) {
    throw new BridgeFailure('DSHX3203', 'Slot Inspect returned an invalid children tree.')
  }
  const { name, kind, scope, ...rest } = node
  return {
    name,
    kind,
    scope,
    ...(Object.keys(rest).length === 0 ? {} : { metadata: rest }),
  }
}

function slotItems(value: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(value) || !Array.isArray(value.trees)) throw new BridgeFailure('DSHX3203', 'Slot Inspect provider returned a response without a trees array.')
  const requestedRoot = value.requestedRoot
  if (requestedRoot !== undefined && (!isRecord(requestedRoot) || typeof requestedRoot.name !== 'string' || requestedRoot.name.trim() === '' || typeof requestedRoot.available !== 'boolean')) {
    throw new BridgeFailure('DSHX3203', 'Slot Inspect returned an invalid requestedRoot descriptor.')
  }
  if (requestedRoot !== undefined) {
    const selected = value.selected
    if (selected === undefined) return []
    if (!isRecord(selected) || selected.name !== requestedRoot.name) throw new BridgeFailure('DSHX3203', 'Slot Inspect selected contract does not match requestedRoot.')
    return [slotNode(selected)]
  }
  const output: Record<string, unknown>[] = []
  const visit = (node: unknown): void => {
    if (!isRecord(node)) throw new BridgeFailure('DSHX3203', 'Slot Inspect returned an invalid tree item.')
    output.push(slotNode(node))
    if (Array.isArray(node.children)) for (const child of node.children) visit(child)
  }
  for (const tree of value.trees) visit(tree)
  return output
}

async function queryComposition(ctx: Context, metadata: HostInspectBridgeMetadata, target: HostInspectTarget, input?: Record<string, unknown>): Promise<readonly Record<string, unknown>[]> {
  const registry = ctx.get('cordisInspect') as InspectRegistry | undefined
  const agents = ctx.get('agents') as AgentRegistry | undefined
  if (registry === undefined || agents === undefined) throw new BridgeFailure('DSHX3201', 'The official Cordis Inspect registry or Agent factory is unavailable.')
  const provider = target === 'services' ? 'Service' : target === 'events' ? 'Event' : 'Slots'
  const method = target === 'services' ? 'listService' : target === 'events' ? 'listEvents' : 'listSubTree'
  const platform = target === 'slots' ? 'client' : 'host'
  if (!registry.list().some(entry => entry.id === provider)) throw new BridgeFailure('DSHX3201', `The official ${provider} Inspect provider is not registered.`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('Inspect provider request timed out.')), REQUEST_TIMEOUT_MS)
  let handle: { agent: unknown; dispose(): Promise<void> } | undefined
  try {
    handle = await agents.create({ sessionId: `dshx-inspect-${randomUUID()}`, meta: { cwd: metadata.root } })
    const result = await registry.query(platform, provider, method, input, handle.agent, controller.signal)
    return target === 'slots' ? slotItems(result) : catalogItems(target, result)
  } catch (error) {
    if (error instanceof BridgeFailure) throw error
    throw new BridgeFailure('DSHX3202', `Official Inspect query failed: ${errorMessage(error)}`)
  } finally {
    clearTimeout(timer)
    if (handle !== undefined) {
      try {
        await handle.dispose()
      } catch (error) {
        if (!controller.signal.aborted) throw new BridgeFailure('DSHX3202', `Temporary Inspect Agent cleanup failed: ${errorMessage(error)}`)
      }
    }
  }
}

function writeResponse(socket: Socket, response: BridgeResponse): void {
  const text = JSON.stringify(response)
  if (Buffer.byteLength(text) > MAX_MESSAGE_BYTES) {
    socket.end(`${JSON.stringify(responseError(response.requestId, response.target, 'DSHX3203', 'Inspect bridge response exceeds the size limit.'))}\n`)
    return
  }
  socket.end(`${text}\n`)
}

/** Start the dshx-owned bridge inside the current Host Composition. */
export async function startHostInspectBridge(ctx: Context, metadata: HostInspectBridgeMetadata): Promise<HostInspectBridgeHandle> {
  const location = paths(metadata.packageId)
  const token = randomUUID()
  await mkdir(location.directory, { recursive: true, mode: 0o700 })
  await chmod(location.directory, 0o700)
  await removeStaleEndpoint(location)

  const server: Server = createServer(socket => {
    let buffer = ''
    let handled = false
    socket.on('data', chunk => {
      if (handled) return
      buffer += chunk.toString()
      if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) {
        handled = true
        writeResponse(socket, responseError('unknown', 'services', 'DSHX3203', 'Inspect bridge request exceeds the size limit.'))
        return
      }
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      handled = true
      const text = buffer.slice(0, newline)
      let requestId = 'unknown'
      let target: HostInspectTarget = 'services'
      try {
        const request = parseRequest(text, token)
        requestId = request.requestId
        target = request.target
        void queryComposition(ctx, metadata, target, request.input)
          .then(items => writeResponse(socket, { version: PROTOCOL_VERSION, requestId, ok: true, target, items }))
          .catch(error => writeResponse(socket, responseError(requestId, target, error instanceof BridgeFailure ? error.code : 'DSHX3202', errorMessage(error))))
      } catch (error) {
        writeResponse(socket, responseError(requestId, target, error instanceof BridgeFailure ? error.code : 'DSHX3203', errorMessage(error)))
      }
    })
  })

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(location.socketPath, () => {
        server.off('error', reject)
        resolve()
      })
    })
    await chmod(location.socketPath, 0o600)
    await writeFile(location.metadataPath, JSON.stringify({ version: PROTOCOL_VERSION, ...metadata, pid: runtimeProcess()?.pid ?? 0, socketPath: location.socketPath, token }) + '\n', { mode: 0o600 })
    await chmod(location.metadataPath, 0o600)
  } catch (error) {
    await new Promise<void>(resolve => server.close(() => resolve())).catch(() => undefined)
    await rm(location.socketPath, { force: true })
    await rm(location.metadataPath, { force: true })
    throw error
  }

  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(location.socketPath, { force: true })
    await rm(location.metadataPath, { force: true })
  }
  return { metadataPath: location.metadataPath, socketPath: location.socketPath, close }
}

/** Register bridge cleanup with the Host Fiber. */
export function ownHostInspectBridge(ctx: Context, bridge: HostInspectBridgeHandle): void {
  ctx.effect(() => () => bridge.close(), 'dshx.inspect-bridge')
}

export function inspectBridgeEnabled(): boolean {
  return runtimeProcess()?.env.DSHX_INSPECT_BRIDGE === '1'
}

export async function readBridgeMetadata(path: string): Promise<Record<string, unknown>> {
  const value = JSON.parse(await readFile(path, 'utf8')) as unknown
  if (!isRecord(value)) throw new Error('Inspect bridge metadata must be an object.')
  return value
}
