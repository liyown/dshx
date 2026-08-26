import type { ReactNode } from 'react'
import type {
  AnyApiMethodDefinition,
  ApiCallOptions,
  ApiClient,
  ApiClientInput,
  ApiClientOutput,
  ApiContract,
  ApiError,
  ApiFetchStatus,
  ApiQueryOptions,
  ApiQueryResult,
} from './types.js'
import { apiConnectionAvailable, createApiClient, isApiError, subscribeApiConnection } from './runtime.js'

type ReactRuntime = typeof import('react')
declare const require: ((name: string) => ReactRuntime) | undefined
let react: ReactRuntime | undefined
let apiContext: import('react').Context<ApiClientRuntime | undefined> | undefined

interface ContextLike {
  get(name: string): unknown
}

export interface ApiClientRuntime {
  client<const Methods extends Record<string, AnyApiMethodDefinition>>(contract: ApiContract<Methods>): ApiClient<Methods>
}

function runtime(): ReactRuntime {
  if (react !== undefined) return react
  const loader = typeof require === 'function' ? require : (globalThis as { require?: (name: string) => ReactRuntime }).require
  if (typeof loader !== 'function') throw new Error('React runtime is unavailable for API hooks.')
  react = loader('react')
  return react
}

function context(): import('react').Context<ApiClientRuntime | undefined> {
  if (apiContext !== undefined) return apiContext
  apiContext = runtime().createContext<ApiClientRuntime | undefined>(undefined)
  return apiContext
}

/** One lazy contract-identity map for the lifetime of a Client Fiber. */
export function createApiClientRuntime(ctx: ContextLike, packageId: string): ApiClientRuntime {
  const clients = new Map<object, ApiClient>()
  return {
    client<const Methods extends Record<string, AnyApiMethodDefinition>>(contract: ApiContract<Methods>): ApiClient<Methods> {
      const existing = clients.get(contract)
      if (existing !== undefined) return existing as ApiClient<Methods>
      const created = createApiClient(ctx, contract, packageId)
      clients.set(contract, created)
      return created
    },
  }
}

export function provideApiContext(component: (props: any) => ReactNode, client: ApiClientRuntime): (props: any) => ReactNode {
  return (props: any) => runtime().createElement(context().Provider, { value: client }, runtime().createElement(component, props))
}

export function useApi<const Methods extends Record<string, AnyApiMethodDefinition>>(contract: ApiContract<Methods>): ApiClient<Methods> {
  const client = runtime().useContext(context())
  if (client !== undefined) return client.client(contract)
  throw new Error(`API ${JSON.stringify(contract.id)} is unavailable outside a DSHX Client Slot component.`)
}

interface ApiQueryEffectOptions<T> {
  readonly available: () => boolean
  readonly subscribe: (listener: () => void) => () => void
  readonly invoke: (signal: AbortSignal) => Promise<T>
  readonly signal?: AbortSignal
  readonly onPending: (fetchStatus: ApiFetchStatus) => void
  readonly onSuccess: (value: T) => void
  readonly onError: (error: ApiError) => void
  readonly onReconnect: () => void
}

/** Query lifecycle seam kept React-free for generation-loss tests. */
export function startApiQueryEffect<T>(options: ApiQueryEffectOptions<T>): () => void {
  const controller = new AbortController()
  let disposed = false
  let disconnected = !options.available()
  let callerAborted = options.signal?.aborted === true
  const abortFromCaller = (): void => {
    callerAborted = true
    controller.abort(options.signal?.reason)
  }
  if (callerAborted) abortFromCaller()
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true })

  options.onPending(disconnected ? 'paused' : 'fetching')
  const unsubscribe = options.subscribe(() => {
    if (disposed) return
    const available = options.available()
    if (!available && !disconnected) {
      disconnected = true
      controller.abort()
      options.onPending('paused')
    } else if (available && disconnected) {
      disconnected = false
      options.onReconnect()
    }
  })

  const availableAfterSubscribe = options.available()
  if (availableAfterSubscribe === disconnected) options.onPending(availableAfterSubscribe ? 'fetching' : 'paused')
  disconnected = !availableAfterSubscribe
  if (!disconnected) {
    void options.invoke(controller.signal).then(
      value => {
        if (!disposed && !controller.signal.aborted) options.onSuccess(value)
      },
      cause => {
        if (!disposed && !disconnected && (callerAborted || !controller.signal.aborted) && isApiError(cause)) options.onError(cause)
      },
    )
  }

  return () => {
    disposed = true
    controller.abort()
    options.signal?.removeEventListener('abort', abortFromCaller)
    unsubscribe()
  }
}

function stableJson(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'bigint') throw new TypeError('API query input must be JSON serializable.')
    return JSON.stringify(value) ?? 'undefined'
  }
  if (seen.has(value)) throw new TypeError('API query input must not contain cycles.')
  seen.add(value)
  try {
    const jsonValue = 'toJSON' in value && typeof value.toJSON === 'function' ? value.toJSON() : value
    if (jsonValue !== value) return stableJson(jsonValue, seen)
    if (Array.isArray(value))
      return `[${value.map(item => (item === undefined || typeof item === 'function' || typeof item === 'symbol' ? 'null' : stableJson(item, seen))).join(',')}]`
    const source = value as Record<string, unknown>
    return `{${Object.keys(source)
      .sort()
      .filter(key => source[key] !== undefined && typeof source[key] !== 'function' && typeof source[key] !== 'symbol')
      .map(key => `${JSON.stringify(key)}:${stableJson(source[key], seen)}`)
      .join(',')}}`
  } finally {
    seen.delete(value)
  }
}

type InternalQueryState<T> =
  | { readonly status: 'pending'; readonly fetchStatus: ApiFetchStatus; readonly data: undefined; readonly error: null }
  | { readonly status: 'success'; readonly fetchStatus: ApiFetchStatus; readonly data: T; readonly error: null }
  | { readonly status: 'error'; readonly fetchStatus: 'idle'; readonly data: T | undefined; readonly error: ApiError }

export function useApiQuery<const Methods extends Record<string, AnyApiMethodDefinition>, K extends keyof Methods & string>(
  contract: ApiContract<Methods>,
  method: K,
  ...args: ApiClientInput<Methods[K]> extends void ? [options?: ApiQueryOptions<Methods[K]>] : [options: ApiQueryOptions<Methods[K]>]
): ApiQueryResult<ApiClientOutput<Methods[K]>> {
  const options = args[0] as ApiQueryOptions<Methods[K]> | undefined
  const input = options !== undefined && 'input' in options ? options.input : undefined
  const api = useApi(contract)
  const [state, setState] = runtime().useState<InternalQueryState<ApiClientOutput<Methods[K]>>>({
    status: 'pending',
    fetchStatus: options?.enabled === false ? 'idle' : 'fetching',
    data: undefined,
    error: null,
  })
  const fingerprint = runtime().useMemo(() => stableJson(input), [input])
  const [revision, setRevision] = runtime().useState(0)
  const manualRevision = runtime().useRef(0)

  runtime().useEffect(() => {
    const manuallyRequested = manualRevision.current === revision && revision > 0
    if (manuallyRequested) manualRevision.current = -1
    if (options?.enabled === false && !manuallyRequested) {
      setState(previous =>
        previous.status === 'success' ? { ...previous, fetchStatus: 'idle' } : { status: 'pending', fetchStatus: 'idle', data: undefined, error: null },
      )
      return undefined
    }
    let manualPending = manuallyRequested
    return startApiQueryEffect<ApiClientOutput<Methods[K]>>({
      available: () => apiConnectionAvailable(api),
      subscribe: listener => subscribeApiConnection(api, listener),
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
      onPending: fetchStatus =>
        setState(previous => {
          if (previous.status === 'success') return { status: 'success', fetchStatus, data: previous.data, error: null }
          if (previous.status === 'error' && previous.data !== undefined) {
            return { status: 'success', fetchStatus, data: previous.data as ApiClientOutput<Methods[K]>, error: null }
          }
          return { status: 'pending', fetchStatus, data: undefined, error: null }
        }),
      onSuccess: data => {
        manualPending = false
        setState({ status: 'success', fetchStatus: 'idle', data, error: null })
      },
      onError: error => {
        manualPending = false
        setState(previous => ({ status: 'error', fetchStatus: 'idle', data: previous.data, error }))
      },
      onReconnect: () =>
        setRevision(value => {
          if (manualPending) manualRevision.current = value + 1
          return value + 1
        }),
      invoke: signal => {
        const call = api[method] as unknown as (value?: unknown, callOptions?: ApiCallOptions) => Promise<ApiClientOutput<Methods[K]>>
        return call(input, { signal })
      },
    })
  }, [api, method, fingerprint, revision, options?.enabled, options?.signal])

  const refetch = runtime().useCallback(() => {
    setRevision(value => {
      manualRevision.current = value + 1
      return value + 1
    })
  }, [])
  return { ...state, refetch } as ApiQueryResult<ApiClientOutput<Methods[K]>>
}
