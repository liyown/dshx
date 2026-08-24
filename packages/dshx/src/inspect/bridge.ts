import { randomUUID, createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { DshxError } from '../diagnostics.js'
import type { DshxDiagnostic } from '../diagnostics.js'
import type { ResolvedDshxConfig } from '../config/types.js'
import type { InspectProvider, InspectSlotOptions, ServiceSummary, EventSummary, SlotSummary, ToolSummary } from './types.js'

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

export type InspectBridgeState = 'disabled' | 'running' | 'stale' | 'invalid' | 'unavailable'

export interface InspectBridgeStatus {
  readonly state: InspectBridgeState
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly diagnostics: readonly DshxDiagnostic[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function bridgeName(packageId: string): string {
  return createHash('sha256').update(packageId).digest('hex').slice(0, 20)
}

function endpointPaths(packageId: string, env: Readonly<NodeJS.ProcessEnv>): { metadataPath: string; socketPath: string } {
  const dshHome = env.DSH_HOME?.trim() ? resolve(env.DSH_HOME.trim()) : join(homedir(), '.dsh')
  const directory = join(dshHome, 'runtime', 'dshx', 'inspect')
  const name = bridgeName(packageId)
  const regularSocket = join(directory, `${name}.sock`)
  const socketPath =
    regularSocket.length > 90 ? join(tmpdir(), `dshx-${createHash('sha256').update(`${dshHome}:${packageId}`).digest('hex').slice(0, 24)}.sock`) : regularSocket
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

function publicMetadata(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
  const { token: _token, ...safe } = value
  return safe
}

/** Read the local Host bridge state without connecting to or starting DSH. */
export async function inspectBridgeStatus(project: ResolvedDshxConfig, options: DshInspectBridgeProviderOptions = {}): Promise<InspectBridgeStatus> {
  const env = { ...process.env, ...options.env }
  const paths = endpointPaths(project.packageId, env)
  let text: string
  try {
    text = await readFile(paths.metadataPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'disabled', diagnostics: [] }
    return {
      state: 'invalid',
      diagnostics: [
        {
          code: 'DSHX5103',
          severity: 'warning',
          message: `Unable to read the Host Inspect bridge metadata: ${String(error)}`,
          file: project.packageFile,
          hint: 'Remove the stale bridge metadata or restart the DSH Composition with dshx dev.',
        },
      ],
    }
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    return {
      state: 'invalid',
      diagnostics: [
        {
          code: 'DSHX5103',
          severity: 'warning',
          message: `Host Inspect bridge metadata is not valid JSON: ${String(error)}`,
          file: project.packageFile,
          hint: 'Restart the DSH Composition so DSHX can recreate its bridge metadata.',
        },
      ],
    }
  }
  if (
    !isRecord(value) ||
    value.version !== PROTOCOL_VERSION ||
    typeof value.packageId !== 'string' ||
    typeof value.root !== 'string' ||
    !isAbsolute(value.root) ||
    typeof value.pid !== 'number' ||
    !Number.isInteger(value.pid) ||
    typeof value.socketPath !== 'string' ||
    !isAbsolute(value.socketPath)
  ) {
    return {
      state: 'invalid',
      diagnostics: [
        {
          code: 'DSHX5103',
          severity: 'warning',
          message: 'Host Inspect bridge metadata is invalid.',
          file: project.packageFile,
          hint: 'Restart the DSH Composition so DSHX can recreate its bridge metadata.',
        },
      ],
    }
  }
  if (value.packageId !== project.packageId || resolve(value.root) !== resolve(project.root) || resolve(value.socketPath) !== resolve(paths.socketPath)) {
    return {
      state: 'invalid',
      diagnostics: [
        {
          code: 'DSHX5103',
          severity: 'warning',
          message: 'Host Inspect bridge metadata does not belong to this project.',
          file: project.packageFile,
          hint: 'Close stale DSH processes and restart the project from its configured root.',
        },
      ],
    }
  }
  if (!processAlive(value.pid)) {
    return {
      state: 'stale',
      metadata: publicMetadata(value),
      diagnostics: [
        {
          code: 'DSHX5103',
          severity: 'warning',
          message: 'The Host Inspect bridge belongs to an exited Composition.',
          file: project.packageFile,
          hint: 'Restart the project with dshx dev before using runtime Inspect.',
        },
      ],
    }
  }
  try {
    await access(value.socketPath)
  } catch {
    return {
      state: 'stale',
      metadata: publicMetadata(value),
      diagnostics: [
        {
          code: 'DSHX5103',
          severity: 'warning',
          message: 'The Host Inspect bridge socket is missing.',
          file: project.packageFile,
          hint: 'Restart the project with dshx dev before using runtime Inspect.',
        },
      ],
    }
  }
  const runtimePlugins = Array.isArray(value.runtimePlugins) ? value.runtimePlugins : []
  const failed = runtimePlugins.some(item => isRecord(item) && (item.status === 'failed' || item.status === 'missing'))
  return {
    state: failed ? 'unavailable' : 'running',
    metadata: publicMetadata(value),
    diagnostics: failed
      ? [
          {
            code: 'DSHX5103',
            severity: 'warning',
            message: 'One or more optional DSHX runtime plugins failed to load in the running Composition.',
            file: project.packageFile,
            hint: 'Run dshx check --json for plugin details and install the missing development dependencies.',
          },
        ]
      : [],
  }
}

async function readMetadata(
  path: string,
  project: ResolvedDshxConfig,
  expectedSocket: string,
): Promise<{ metadata: Required<Pick<BridgeMetadata, 'packageId' | 'root' | 'pid' | 'socketPath' | 'token'>>; socketPath: string }> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code === 'ENOENT' ? 'DSHX3201' : 'DSHX3202'
    throw fail(
      code,
      code === 'DSHX3201' ? 'No Host Inspect bridge endpoint is available.' : `Unable to read the Host Inspect bridge metadata: ${String(cause)}`,
      'Start the project with "dshx dev" and enable the Host Inspect bridge.',
    )
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (cause) {
    throw fail(
      'DSHX3203',
      `Host Inspect bridge metadata is not valid JSON: ${String(cause)}`,
      'Restart the current DSH Composition so DSHX can recreate its endpoint metadata.',
    )
  }
  if (
    !isRecord(value) ||
    value.version !== PROTOCOL_VERSION ||
    typeof value.packageId !== 'string' ||
    typeof value.root !== 'string' ||
    typeof value.pid !== 'number' ||
    !Number.isInteger(value.pid) ||
    typeof value.socketPath !== 'string' ||
    typeof value.token !== 'string' ||
    value.token === ''
  ) {
    throw fail('DSHX3203', 'Host Inspect bridge metadata is invalid.', 'Restart the current DSH Composition so DSHX can recreate its endpoint metadata.')
  }
  if (!isAbsolute(value.root) || !isAbsolute(value.socketPath) || value.packageId !== project.packageId || resolve(value.root) !== resolve(project.root)) {
    throw fail(
      'DSHX3202',
      'Host Inspect bridge metadata does not belong to this project.',
      'Close stale DSH processes and restart the project from its configured root.',
    )
  }
  if (resolve(value.socketPath) !== resolve(expectedSocket)) {
    throw fail(
      'DSHX3202',
      'Host Inspect bridge socket path does not match its package endpoint.',
      'Restart the current DSH Composition and retry the Inspect command.',
    )
  }
  if (!processAlive(value.pid)) {
    throw fail('DSHX3205', 'The Host Inspect bridge belongs to an exited Composition.', 'Restart the DSH Composition, then retry Inspect.')
  }
  return { metadata: value as Required<Pick<BridgeMetadata, 'packageId' | 'root' | 'pid' | 'socketPath' | 'token'>>, socketPath: value.socketPath }
}

async function request(
  project: ResolvedDshxConfig,
  target: 'services' | 'events' | 'slots',
  options: DshInspectBridgeProviderOptions,
  input?: Record<string, unknown>,
): Promise<readonly Record<string, unknown>[]> {
  const env = { ...process.env, ...options.env }
  const paths = endpointPaths(project.packageId, env)
  const { metadata, socketPath } = await readMetadata(paths.metadataPath, project, paths.socketPath)
  const requestId = `inspect-${randomUUID()}`
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const payload =
    JSON.stringify({ version: PROTOCOL_VERSION, requestId, token: metadata.token, operation: 'list', target, ...(input === undefined ? {} : { input }) }) + '\n'
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
    socket.on('error', error =>
      finish(
        fail(
          'DSHX3202',
          `Unable to connect to the Host Inspect bridge: ${error instanceof Error ? error.message : String(error)}`,
          'Ensure the Composition is still running and that DSHX_INSPECT_BRIDGE=1 was enabled.',
        ),
      ),
    )
    socket.on('data', chunk => {
      buffer += chunk.toString()
      if (Buffer.byteLength(buffer) > MAX_MESSAGE_BYTES) {
        finish(fail('DSHX3203', 'Host Inspect bridge response exceeds the size limit.', 'Use the official bridge protocol and retry.'))
        return
      }
      const newline = buffer.indexOf('\n')
      if (newline < 0) return
      let value: unknown
      try {
        value = JSON.parse(buffer.slice(0, newline))
      } catch (cause) {
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
  constructor(
    private readonly project: ResolvedDshxConfig,
    private readonly options: DshInspectBridgeProviderOptions = {},
  ) {}

  async listSlots(options: InspectSlotOptions = {}): Promise<readonly SlotSummary[]> {
    if (options.root !== undefined && (typeof options.root !== 'string' || options.root.trim() === '')) {
      throw fail('DSHX3203', 'Slot Inspect root must be a non-empty string.', 'Pass a valid Slot name or omit --root.')
    }
    return (await request(
      this.project,
      'slots',
      this.options,
      options.root === undefined ? undefined : { root: options.root },
    )) as unknown as readonly SlotSummary[]
  }

  listTools(): Promise<readonly ToolSummary[]> {
    return Promise.reject(
      fail('DSHX3204', 'The Host Inspect bridge does not expose Tool data.', 'Use the official Tool Inspect provider when it is available.'),
    )
  }

  async listServices(): Promise<readonly ServiceSummary[]> {
    return (await request(this.project, 'services', this.options)) as unknown as readonly ServiceSummary[]
  }

  async listEvents(): Promise<readonly EventSummary[]> {
    return (await request(this.project, 'events', this.options)) as unknown as readonly EventSummary[]
  }
}
