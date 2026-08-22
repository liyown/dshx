import { randomUUID, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { DshxError } from '../diagnostics.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { InspectProvider, ServiceSummary, EventSummary, SlotSummary, ToolSummary } from './types.js'

const PROTOCOL_VERSION = 1
const MAX_MESSAGE_BYTES = 64 * 1024
const DEFAULT_TIMEOUT_MS = 10_000

interface BridgeMetadata {
  readonly version?: unknown
  readonly packageId?: unknown
  readonly root?: unknown
  readonly pid?: unknown
  readonly socketPath?: unknown
  readonly token?: unknown
}

interface BridgeResponse {
  readonly version?: unknown
  readonly requestId?: unknown
  readonly ok?: unknown
  readonly target?: unknown
  readonly items?: unknown
  readonly error?: unknown
}

export interface DshInspectBridgeProviderOptions {
  readonly env?: Readonly<NodeJS.ProcessEnv>
  readonly timeoutMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function bridgeName(packageId: string): string {
  return createHash('sha256').update(packageId).digest('hex').slice(0, 20)
}

function endpointPaths(packageId: string, env: Readonly<NodeJS.ProcessEnv>): { metadataPath: string; socketPath: string } {
  const dshHome = env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  const directory = join(dshHome, 'runtime', 'dshx', 'inspect')
  const name = bridgeName(packageId)
  const regularSocket = join(directory, `${name}.sock`)
  const socketPath = regularSocket.length > 90
    ? join(tmpdir(), `dshx-${createHash('sha256').update(`${dshHome}:${packageId}`).digest('hex').slice(0, 24)}.sock`)
    : regularSocket
  return { metadataPath: join(directory, `${name}.json`), socketPath }
}

function fail(code: 'DSHX3201' | 'DSHX3202' | 'DSHX3203' | 'DSHX3204' | 'DSHX3205', message: string, hint: string): DshxError {
  return new DshxError(code, message, { hint })
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

async function readMetadata(path: string, project: ResolvedDshxConfig, expectedSocket: string): Promise<{ metadata: Required<Pick<BridgeMetadata, 'packageId' | 'root' | 'pid' | 'socketPath' | 'token'>>; socketPath: string }> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code === 'ENOENT' ? 'DSHX3201' : 'DSHX3202'
    throw fail(code, code === 'DSHX3201' ? 'No Host Inspect bridge endpoint is available.' : `Unable to read the Host Inspect bridge metadata: ${String(cause)}`, 'Start the project with "dshx dev" and enable the Host Inspect bridge.')
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (cause) {
    throw fail('DSHX3203', `Host Inspect bridge metadata is not valid JSON: ${String(cause)}`, 'Restart the current DSH Composition so DSHX can recreate its endpoint metadata.')
  }
  if (!isRecord(value) || value.version !== PROTOCOL_VERSION || typeof value.packageId !== 'string' || typeof value.root !== 'string' || typeof value.pid !== 'number' || !Number.isInteger(value.pid) || typeof value.socketPath !== 'string' || typeof value.token !== 'string' || value.token === '') {
    throw fail('DSHX3203', 'Host Inspect bridge metadata is invalid.', 'Restart the current DSH Composition so DSHX can recreate its endpoint metadata.')
  }
  if (!isAbsolute(value.root) || !isAbsolute(value.socketPath) || value.packageId !== project.packageId || resolve(value.root) !== resolve(project.root)) {
    throw fail('DSHX3202', 'Host Inspect bridge metadata does not belong to this project.', 'Close stale DSH processes and restart the project from its configured root.')
  }
  if (resolve(value.socketPath) !== resolve(expectedSocket)) {
    throw fail('DSHX3202', 'Host Inspect bridge socket path does not match its package endpoint.', 'Restart the current DSH Composition and retry the Inspect command.')
  }
  if (!processAlive(value.pid)) {
    throw fail('DSHX3205', 'The Host Inspect bridge belongs to an exited Composition.', 'Restart the DSH Composition, then retry Inspect.')
  }
  return { metadata: value as Required<Pick<BridgeMetadata, 'packageId' | 'root' | 'pid' | 'socketPath' | 'token'>>, socketPath: value.socketPath }
}

async function request(project: ResolvedDshxConfig, target: 'services' | 'events', options: DshInspectBridgeProviderOptions): Promise<readonly Record<string, unknown>[]> {
  const env = { ...process.env, ...options.env }
  const paths = endpointPaths(project.packageId, env)
  const { metadata, socketPath } = await readMetadata(paths.metadataPath, project, paths.socketPath)
  const requestId = `inspect-${randomUUID()}`
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const payload = JSON.stringify({ version: PROTOCOL_VERSION, requestId, token: metadata.token, operation: 'list', target }) + '\n'
  return await new Promise((resolveRequest, rejectRequest) => {
    const socket = createConnection(socketPath)
    let buffer = ''
    let settled = false
    const timer = setTimeout(() => {
      socket.destroy()
      rejectRequest(fail('DSHX3202', 'Timed out while querying the Host Inspect bridge.', 'Check the running Composition and retry the Inspect command.'))
      settled = true
    }, timeoutMs)
    const finish = (error?: unknown, items?: readonly Record<string, unknown>[]) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      if (error !== undefined) rejectRequest(error)
      else resolveRequest(items ?? [])
    }
    socket.on('error', error => finish(fail('DSHX3202', `Unable to connect to the Host Inspect bridge: ${error instanceof Error ? error.message : String(error)}`, 'Ensure the Composition is still running and that DSHX_INSPECT_BRIDGE=1 was enabled.')))
    socket.on('data', chunk => {
      buffer += chunk.toString()
      if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) {
        finish(fail('DSHX3203', 'Host Inspect bridge response exceeds the size limit.', 'Use the official bridge protocol and retry.'))
        return
      }
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      let value: unknown
      try { value = JSON.parse(buffer.slice(0, newline)) } catch (cause) {
        finish(fail('DSHX3203', `Host Inspect bridge returned invalid JSON: ${String(cause)}`, 'Restart the Composition and retry the Inspect command.'))
        return
      }
      if (!isRecord(value)) {
        finish(fail('DSHX3203', 'Host Inspect bridge returned an invalid response object.', 'Restart the Composition and retry the Inspect command.'))
        return
      }
      const response = value as BridgeResponse
      if (response.version !== PROTOCOL_VERSION || response.requestId !== requestId || response.target !== target || typeof response.ok !== 'boolean') {
        finish(fail('DSHX3203', 'Host Inspect bridge response has an invalid protocol header.', 'Restart the Composition and retry the Inspect command.'))
        return
      }
      if (response.ok === false) {
        const error = isRecord(response.error) ? response.error : undefined
        const code = error?.code
        const message = error?.message
        if ((code !== 'DSHX3201' && code !== 'DSHX3202' && code !== 'DSHX3203' && code !== 'DSHX3204' && code !== 'DSHX3205') || typeof message !== 'string') {
          finish(fail('DSHX3203', 'Host Inspect bridge returned an invalid error response.', 'Restart the Composition and retry the Inspect command.'))
        } else {
          finish(fail(code, message, 'Inspect the running Composition and retry the command.'))
        }
        return
      }
      if (!Array.isArray(response.items) || response.items.some(item => !isRecord(item))) {
        finish(fail('DSHX3203', 'Host Inspect bridge returned an invalid item list.', 'Restart the Composition and retry the Inspect command.'))
        return
      }
      finish(undefined, response.items as readonly Record<string, unknown>[])
    })
    socket.on('connect', () => socket.write(payload))
  })
}

/** Read-only client for the DSHX Host-owned Runtime Inspect bridge. */
export class DshInspectBridgeProvider implements InspectProvider {
  constructor(private readonly project: ResolvedDshxConfig, private readonly options: DshInspectBridgeProviderOptions = {}) {}

  listSlots(): Promise<readonly SlotSummary[]> {
    return Promise.reject(fail('DSHX3204', 'The Host Inspect bridge does not expose Slot data.', 'Use the official Slot Inspect provider when it is available.'))
  }

  listTools(): Promise<readonly ToolSummary[]> {
    return Promise.reject(fail('DSHX3204', 'The Host Inspect bridge does not expose Tool data.', 'Use the official Tool Inspect provider when it is available.'))
  }

  async listServices(): Promise<readonly ServiceSummary[]> {
    return await request(this.project, 'services', this.options) as unknown as readonly ServiceSummary[]
  }

  async listEvents(): Promise<readonly EventSummary[]> {
    return await request(this.project, 'events', this.options) as unknown as readonly EventSummary[]
  }
}
