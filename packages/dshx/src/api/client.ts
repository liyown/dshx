import type { ReactNode } from 'react'
import type { ApiCallOptions, ApiClient, ApiContract, ApiError, ApiMethodDefinition, ApiOutput, ApiQueryState } from './types.js'
import { apiConnectionAvailable, createApiClient, subscribeApiConnection } from './runtime.js'

type ReactRuntime = typeof import('react')
type ApiMap = ReadonlyMap<ApiContract, ApiClient>
declare const require: ((name: string) => ReactRuntime) | undefined
let react: ReactRuntime | undefined
let apiContext: import('react').Context<ApiMap | undefined> | undefined

function runtime(): ReactRuntime {
  if (react !== undefined) return react
  // The Client artifact supplies a CommonJS require function inside its module
  // loader. Keeping this lookup lazy avoids requiring React for Client plugins
  // that do not declare an API.
  const loader = typeof require === 'function'
    ? require
    : (globalThis as { require?: (name: string) => ReactRuntime }).require
  if (typeof loader !== 'function') throw new Error('React runtime is unavailable for API hooks.')
  react = loader('react')
  return react
}

function context(): import('react').Context<ApiMap | undefined> {
  if (apiContext !== undefined) return apiContext
  apiContext = runtime().createContext<ApiMap | undefined>(undefined)
  return apiContext
}

export function provideApiContext(
  component: (props: any) => ReactNode,
  clients: ReadonlyMap<ApiContract, ApiClient>,
): (props: any) => ReactNode {
  return (props: any) => runtime().createElement(context().Provider, { value: clients }, runtime().createElement(component, props))
}

export function useApi<const Methods extends Record<string, ApiMethodDefinition<any, any>>>(
  contract: ApiContract<Methods>,
): ApiClient<Methods> {
  const clients = runtime().useContext(context())
  const existing = clients?.get(contract)
  if (existing !== undefined) return existing as ApiClient<Methods>
  throw new Error(`API ${JSON.stringify(contract.id)} is not available in this Client component.`)
}

export function useQuery<const Methods extends Record<string, ApiMethodDefinition<any, any>>, K extends keyof Methods & string>(
  contract: ApiContract<Methods>,
  method: K,
  input?: ApiMethodDefinition extends Methods[K] ? unknown : Methods[K] extends ApiMethodDefinition<infer I, unknown> ? I : never,
  options?: ApiCallOptions,
): ApiQueryState<ApiOutput<Methods[K]>> {
  const api = useApi(contract)
  const [state, setState] = runtime().useState<{ loading: boolean; data?: ApiOutput<Methods[K]>; error?: ApiError }>({ loading: true })
  const serializedInput = runtime().useMemo(() => {
    try { return JSON.stringify(input) } catch { return String(input) }
  }, [input])
  const [revision, setRevision] = runtime().useState(0)
  runtime().useEffect(() => {
    const controller = new AbortController()
    let autoRetried = false
    setState(previous => ({ loading: true, ...(previous.data === undefined ? {} : { data: previous.data }) }))
    const call = (api[method] as unknown as (value?: unknown, callOptions?: ApiCallOptions) => Promise<ApiOutput<Methods[K]>>)
    void call(input, { ...options, signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ loading: false, data })
    }).catch(error => {
      if (!controller.signal.aborted) setState({ loading: false, error: error as ApiError })
    })
    const unsubscribe = subscribeApiConnection(api, () => {
      if (controller.signal.aborted) return
      if (!apiConnectionAvailable(api)) {
        autoRetried = false
        setState(previous => ({ loading: true, ...(previous.data === undefined ? {} : { data: previous.data }) }))
      } else if (!autoRetried) {
        autoRetried = true
        setRevision(value => value + 1)
      }
    })
    return () => {
      controller.abort()
      unsubscribe()
    }
    // serializedInput keeps object inputs stable without requiring callers to memoize them.
  }, [api, method, serializedInput, revision])
  return { ...state, retry: () => setRevision(value => value + 1) }
}

export { createApiClient }
