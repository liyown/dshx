import type { ReactNode } from 'react'
import type { ApiCallOptions, ApiClient, ApiContract, ApiError, ApiInput, ApiMethodDefinition, ApiOutput, ApiQueryState } from './types.js'
import { apiConnectionAvailable, createApiClient, subscribeApiConnection } from './runtime.js'

type ReactRuntime = typeof import('react')
declare const require: ((name: string) => ReactRuntime) | undefined
let react: ReactRuntime | undefined
let apiContext: import('react').Context<ApiClientRuntime | undefined> | undefined

interface ContextLike {
  get(name: string): unknown
}

/** One identity-scoped API client cache owned by a Client Fiber. */
export interface ApiClientRuntime {
  client<const Methods extends Record<string, ApiMethodDefinition<any, any>>>(contract: ApiContract<Methods>): ApiClient<Methods>
}

function runtime(): ReactRuntime {
  if (react !== undefined) return react
  // The Client artifact supplies a CommonJS require function inside its module
  // loader. Keeping this lookup lazy avoids requiring React for Client plugins
  // that do not declare an API.
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

/** Create one lazy contract-identity map for the lifetime of a Client Fiber. */
export function createApiClientRuntime(ctx: ContextLike, packageId: string, contracts: readonly ApiContract[] = []): ApiClientRuntime {
  const clients = new Map<object, ApiClient>()
  const client = <const Methods extends Record<string, ApiMethodDefinition<any, any>>>(contract: ApiContract<Methods>): ApiClient<Methods> => {
    const existing = clients.get(contract)
    if (existing !== undefined) return existing as ApiClient<Methods>
    const created = createApiClient(ctx, contract, packageId)
    clients.set(contract, created)
    return created
  }
  const result: ApiClientRuntime = { client }
  // Explicit ClientDefinition.api/apis remain a compatible eager-binding form.
  for (const contract of contracts) result.client(contract)
  return result
}

export function provideApiContext(component: (props: any) => ReactNode, client: ApiClientRuntime): (props: any) => ReactNode {
  return (props: any) => runtime().createElement(context().Provider, { value: client }, runtime().createElement(component, props))
}

export function useApi<const Methods extends Record<string, ApiMethodDefinition<any, any>>>(contract: ApiContract<Methods>): ApiClient<Methods> {
  // The Client compiler uses this retained marker after tree-shaking to infer
  // the Connection capability without a duplicate defineClient declaration.
  runtime().useDebugValue?.('dshx.api-hook.v1')
  const client = runtime().useContext(context())
  if (client !== undefined) return client.client(contract)
  throw new Error(`API ${JSON.stringify(contract.id)} is unavailable outside a DSHX Client Slot component.`)
}

interface ApiQueryEffectOptions<T> {
  readonly available: () => boolean
  readonly subscribe: (listener: () => void) => () => void
  readonly invoke: (signal: AbortSignal) => Promise<T>
  readonly signal?: AbortSignal
  readonly onLoading: () => void
  readonly onSuccess: (value: T) => void
  readonly onError: (error: ApiError) => void
  readonly onReconnect: () => void
}

/** Internal query lifecycle runner kept separate from React so reconnect behavior is fixture-testable. */
export function startApiQueryEffect<T>(options: ApiQueryEffectOptions<T>): () => void {
  const controller = new AbortController()
  let disposed = false
  let disconnected = !options.available()
  const abortFromCaller = (): void => controller.abort(options.signal?.reason)
  if (options.signal?.aborted === true) abortFromCaller()
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true })

  options.onLoading()
  const unsubscribe = options.subscribe(() => {
    if (disposed) return
    const available = options.available()
    if (!available && !disconnected) {
      disconnected = true
      controller.abort()
      options.onLoading()
    } else if (available && disconnected) {
      disconnected = false
      options.onReconnect()
    }
  })

  // Read once more after subscribing so a connection transition cannot be
  // lost between the initial snapshot and listener installation.
  const availableAfterSubscribe = options.available()
  if (availableAfterSubscribe !== !disconnected) {
    disconnected = !availableAfterSubscribe
  }
  if (!disconnected) {
    void options
      .invoke(controller.signal)
      .then(value => {
        if (!disposed && !controller.signal.aborted) options.onSuccess(value)
      })
      .catch(cause => {
        if (!disposed && !disconnected) options.onError(cause as ApiError)
      })
  }

  return () => {
    disposed = true
    controller.abort()
    options.signal?.removeEventListener('abort', abortFromCaller)
    unsubscribe()
  }
}

export function useQuery<const Methods extends Record<string, ApiMethodDefinition<any, any>>, K extends keyof Methods & string>(
  contract: ApiContract<Methods>,
  method: K,
  ...args: ApiInput<Methods[K]> extends void ? [input?: undefined, options?: ApiCallOptions] : [input: ApiInput<Methods[K]>, options?: ApiCallOptions]
): ApiQueryState<ApiOutput<Methods[K]>> {
  const [input, options] = args
  const api = useApi(contract)
  const [state, setState] = runtime().useState<{ loading: boolean; data?: ApiOutput<Methods[K]>; error?: ApiError }>({ loading: true })
  const serializedInput = runtime().useMemo(() => {
    try {
      return JSON.stringify(input)
    } catch {
      return String(input)
    }
  }, [input])
  const [revision, setRevision] = runtime().useState(0)
  runtime().useEffect(
    () =>
      startApiQueryEffect<ApiOutput<Methods[K]>>({
        available: () => apiConnectionAvailable(api),
        subscribe: listener => subscribeApiConnection(api, listener),
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
        onLoading: () => setState(previous => ({ loading: true, ...(previous.data === undefined ? {} : { data: previous.data }) })),
        onSuccess: data => setState({ loading: false, data }),
        onError: error => setState({ loading: false, error }),
        onReconnect: () => setRevision(value => value + 1),
        invoke: signal => {
          const call = api[method] as unknown as (value?: unknown, callOptions?: ApiCallOptions) => Promise<ApiOutput<Methods[K]>>
          return call(input, { ...options, signal })
        },
        // serializedInput keeps object inputs stable without requiring callers to memoize them.
      }),
    [api, method, serializedInput, revision, options?.signal],
  )
  return { ...state, retry: () => setRevision(value => value + 1) }
}

export { createApiClient }
