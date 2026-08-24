import type { Context } from '@deepseek-ai/cordis'
import type { ApiCallOptions, ApiClient, ApiContract, ApiError, ApiHostRegistration, ApiMethodDefinition } from './types.js'
import { ApiError as ApiErrorClass } from './types.js'

const MAX_JSON_BYTES = 1024 * 1024
const channelOwners = new WeakMap<object, Map<string, string>>()

class ContractViolation extends Error {
  override readonly name = 'ContractViolation'
}

type RpcResult = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error?: { readonly code?: string; readonly message?: string } }

interface ConnectionLike {
  readonly rpc?: {
    call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcResult>
    handle?(
      channel: string,
      handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult>,
      options: { authority: 'loopback' | 'trusted-host' },
    ): () => Promise<void>
  }
}

interface ContextLike {
  get(name: string): unknown
}

interface HostDescriptionSourceLike {
  getSnapshot?: () => unknown
  subscribe?: (listener: () => void) => () => void
}

interface ConnectionLifecycleLike {
  readonly hostDescription?: HostDescriptionSourceLike
}

const clientConnections = new WeakMap<object, ConnectionLifecycleLike | undefined>()

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function apiChannel(packageId: string, apiId: string): string {
  return `/dshx-${stableHash(`${packageId}\0${apiId}`)}`
}

function jsonBytes(value: unknown): number {
  if (value === undefined) return 0
  let encoded: string
  try {
    encoded = JSON.stringify(value)
  } catch (cause) {
    throw new ContractViolation(`API payload is not JSON serializable: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (encoded === undefined) throw new ContractViolation('API payload must be JSON serializable.')
  const bytes = new TextEncoder().encode(encoded).byteLength
  if (bytes > MAX_JSON_BYTES) throw new ContractViolation(`API payload exceeds ${MAX_JSON_BYTES} bytes.`)
  return bytes
}

async function validate(schema: unknown, value: unknown): Promise<unknown> {
  if (schema === undefined) return value
  const validator = (schema as { '~standard'?: { validate?: (input: unknown) => unknown | Promise<unknown> } })['~standard']?.validate
  if (typeof validator !== 'function') throw new ContractViolation('API schema does not implement Standard Schema validate().')
  const result = await validator(value)
  if (result !== undefined && typeof result === 'object' && result !== null && 'issues' in result) {
    throw new ContractViolation('API schema validation failed.')
  }
  return result !== undefined && typeof result === 'object' && result !== null && 'value' in result ? (result as { value: unknown }).value : value
}

function error(kind: ApiError['kind'], message: string, apiId: string, method: string, retryable: boolean, cause?: unknown, remoteCode?: string): ApiError {
  return new ApiErrorClass(kind, message, apiId, method, retryable, remoteCode, cause === undefined ? undefined : { cause })
}

function aborted(apiId: string, method: string, cause?: unknown): ApiError {
  return error('aborted', 'API request was aborted.', apiId, method, false, cause, 'aborted')
}

function throwIfAborted(signal: AbortSignal | undefined, apiId: string, method: string): void {
  if (signal?.aborted === true) throw aborted(apiId, method, signal.reason)
}

function errorFromRemote(result: Extract<RpcResult, { readonly ok: false }>, apiId: string, method: string): ApiError {
  const code = result.error?.code
  const message = result.error?.message ?? `API method ${method} failed.`
  if (code === 'DSHX6401' || code === 'contract' || code === 'bad-request') {
    return error('contract', message, apiId, method, false, undefined, code)
  }
  if (code === 'aborted') return aborted(apiId, method)
  return error('remote', message, apiId, method, false, undefined, code)
}

function registrationContract(registration: ApiHostRegistration): ApiContract {
  return registration.contract
}

export async function registerApi(ctx: Context, packageId: string, registration: ApiHostRegistration): Promise<void> {
  const contract = registrationContract(registration)
  const connection = ctx.get('connection') as ConnectionLike | undefined
  if (connection?.rpc?.handle === undefined) {
    console.warn(`API ${contract.id} is unavailable because the DSH Connection provider is not loaded.`)
    return
  }
  const channel = apiChannel(packageId, contract.id)
  const owners = channelOwners.get(ctx) ?? new Map<string, string>()
  const owner = `${packageId}:${contract.id}`
  const previous = owners.get(channel)
  if (previous !== undefined && previous !== owner) {
    throw new Error(`API channel collision at ${channel}: ${previous} and ${owner}.`)
  }
  const remove = connection.rpc.handle(
    channel,
    async (endpoint, payload, signal) => {
      const methodDefinition = contract.methods[endpoint]
      const handler = registration.handlers[endpoint]
      if (methodDefinition === undefined || typeof handler !== 'function') {
        return { ok: false, error: { code: 'bad-request', message: `Unknown API method ${endpoint}.` } }
      }
      try {
        throwIfAborted(signal, contract.id, endpoint)
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
          throw error('contract', 'Invalid API request envelope.', contract.id, endpoint, false)
        const envelope = payload as { version?: unknown; input?: unknown }
        if (envelope.version !== contract.version)
          throw error('contract', `API version mismatch for ${contract.id}.`, contract.id, endpoint, false, undefined, 'DSHX6401')
        const input = await validate(methodDefinition.input, envelope.input)
        jsonBytes(input)
        throwIfAborted(signal, contract.id, endpoint)
        const output = await validate(methodDefinition.output, await handler({ input, ctx, signal } as never))
        throwIfAborted(signal, contract.id, endpoint)
        jsonBytes(output)
        return { ok: true, value: { version: contract.version, output } }
      } catch (cause) {
        if (cause instanceof ApiErrorClass) return { ok: false, error: { code: cause.remoteCode ?? 'internal', message: cause.message } }
        if (cause instanceof ContractViolation) return { ok: false, error: { code: 'contract', message: cause.message } }
        return { ok: false, error: { code: 'internal', message: cause instanceof Error ? cause.message : String(cause) } }
      }
    },
    { authority: registration.authority },
  )
  owners.set(channel, owner)
  channelOwners.set(ctx, owners)
  const dispose = async (): Promise<void> => {
    if (owners.get(channel) === owner) owners.delete(channel)
    if (owners.size === 0) channelOwners.delete(ctx)
    await remove()
  }
  try {
    ctx.effect(() => dispose, `dshx api: ${contract.id}`)
  } catch (cause) {
    await dispose()
    throw cause
  }
}

export function createApiClient<const Methods extends Record<string, ApiMethodDefinition<any, any>>>(
  context: ContextLike | Context | undefined,
  contract: ApiContract<Methods>,
  packageId = 'plugin',
): ApiClient<Methods> {
  const connection = context === undefined || typeof context.get !== 'function' ? undefined : (context.get('connection') as ConnectionLike | undefined)
  const call = async (name: string, input: unknown, options?: ApiCallOptions): Promise<unknown> => {
    const rpc = connection?.rpc
    if (rpc?.call === undefined) throw error('unavailable', 'The DSH Connection provider is unavailable.', contract.id, name, true)
    try {
      throwIfAborted(options?.signal, contract.id, name)
      const methodDefinition = contract.methods[name]
      if (methodDefinition === undefined) throw error('contract', `Unknown API method ${name}.`, contract.id, name, false)
      const validated = await validate(methodDefinition.input, input)
      jsonBytes(validated)
      throwIfAborted(options?.signal, contract.id, name)
      const result = await rpc.call(apiChannel(packageId, contract.id), name, { version: contract.version, input: validated }, options?.signal)
      throwIfAborted(options?.signal, contract.id, name)
      if (!result.ok) throw errorFromRemote(result, contract.id, name)
      const envelope = result.value as { version?: unknown; output?: unknown }
      if (envelope.version !== contract.version)
        throw error('contract', `API version mismatch for ${contract.id}.`, contract.id, name, false, undefined, 'DSHX6401')
      const output = await validate(methodDefinition.output, envelope.output)
      jsonBytes(output)
      throwIfAborted(options?.signal, contract.id, name)
      return output
    } catch (cause) {
      if (cause instanceof ApiErrorClass) throw cause
      if (options?.signal?.aborted) throw aborted(contract.id, name, cause)
      if (cause instanceof ContractViolation) throw error('contract', cause.message, contract.id, name, false, cause)
      throw error('transport', cause instanceof Error ? cause.message : String(cause), contract.id, name, true, cause)
    }
  }
  const client: Record<string, unknown> = { safe: {} }
  for (const name of Object.keys(contract.methods)) {
    const invoke = (input?: unknown, options?: ApiCallOptions) => call(name, input, options)
    client[name] = invoke
    ;(client.safe as Record<string, unknown>)[name] = async (input?: unknown, options?: ApiCallOptions) => {
      try {
        return { ok: true, value: await invoke(input, options) }
      } catch (cause) {
        return { ok: false, error: cause instanceof ApiErrorClass ? cause : error('transport', String(cause), contract.id, name, true, cause) }
      }
    }
  }
  clientConnections.set(client, connection as ConnectionLifecycleLike | undefined)
  return client as ApiClient<Methods>
}

/** Internal lifecycle seam used by the React query adapter. */
export function subscribeApiConnection(client: object, listener: () => void): () => void {
  const source = clientConnections.get(client)?.hostDescription
  return typeof source?.subscribe === 'function' ? source.subscribe(listener) : () => undefined
}

/** Internal snapshot helper; unavailable while the Host generation is down. */
export function apiConnectionAvailable(client: object): boolean {
  const source = clientConnections.get(client)?.hostDescription
  return typeof source?.getSnapshot !== 'function' || source.getSnapshot() !== undefined
}
