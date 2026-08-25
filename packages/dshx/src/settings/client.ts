import type { ReactNode } from 'react'
import type z from '@deepseek-ai/schemastery'
import type { SettingsScopeBinder as OfficialSettingsScopeBinder } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SettingsContract, SettingsReadError, SettingsState, SettingsValue } from './types.js'

type ReactRuntime = typeof import('react')
declare const require: ((name: string) => ReactRuntime) | undefined

interface ScopeSnapshot<T> {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly value: T | undefined
  readonly base: unknown
  readonly user: unknown
  readonly revision: number | undefined
  readonly writable: boolean
  readonly mode: 'host' | 'memory'
}

interface Scope<T> {
  getSnapshot(): ScopeSnapshot<T>
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

interface NamespaceView {
  readonly ns: string
  readonly applies: 'live' | 'restart'
  readonly secrets: readonly { readonly path: readonly string[]; readonly set: boolean }[]
  readonly revision: number
}

interface DescribeSnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'unavailable'
  readonly view:
    | {
        readonly namespaces: readonly NamespaceView[]
        readonly writable: boolean
      }
    | undefined
  readonly error: string | null
}

interface DescribeFace {
  getSnapshot(): DescribeSnapshot
  subscribe(listener: () => void): () => void
  ensure(): Promise<void>
}

type SettingsScopeBinder = Pick<OfficialSettingsScopeBinder, 'bind' | 'describe'>

interface ContextLike {
  get(name: string): unknown
}

interface Binding<T> {
  readonly scope: Scope<T>
  readonly describe: DescribeFace
}

export interface SettingsClientRuntime {
  binding<T>(contract: SettingsContract<z<any, object>, T>): Binding<T>
}

let react: ReactRuntime | undefined
let settingsContext: import('react').Context<SettingsClientRuntime | undefined> | undefined

function runtime(): ReactRuntime {
  if (react !== undefined) return react
  const loader = typeof require === 'function' ? require : (globalThis as { require?: (name: string) => ReactRuntime }).require
  if (typeof loader !== 'function') throw new Error('React runtime is unavailable for Settings hooks.')
  react = loader('react')
  return react
}

function context(): import('react').Context<SettingsClientRuntime | undefined> {
  if (settingsContext !== undefined) return settingsContext
  settingsContext = runtime().createContext<SettingsClientRuntime | undefined>(undefined)
  return settingsContext
}

function unavailableScope<T>(message: string): Scope<T> {
  const snapshot: ScopeSnapshot<T> = {
    status: 'unavailable',
    value: undefined,
    base: undefined,
    user: undefined,
    revision: undefined,
    writable: false,
    mode: 'host',
  }
  const reject = (): Promise<void> => Promise.reject(new Error(message))
  return { getSnapshot: () => snapshot, subscribe: () => () => undefined, set: reject, unset: reject }
}

function unavailableDescribe(message: string): DescribeFace {
  const snapshot: DescribeSnapshot = { status: 'unavailable', view: undefined, error: message }
  return { getSnapshot: () => snapshot, subscribe: () => () => undefined, ensure: () => Promise.resolve() }
}

/** Create one per-Client identity map over official Settings scopes. */
export function createSettingsClientRuntime(ctx: ContextLike): SettingsClientRuntime {
  const binder = ctx.get('settingsScope') as SettingsScopeBinder | undefined
  const missing = 'The official settingsScope service is unavailable. Add @deepseek-ai/dsh-client-ui-settings to dsh.client.inject.'
  const describe = binder?.describe() ?? unavailableDescribe(missing)
  const bindings = new Map<object, Binding<unknown>>()
  return {
    binding<T>(contract: SettingsContract<z<any, object>, T>): Binding<T> {
      const existing = bindings.get(contract)
      if (existing !== undefined) return existing as Binding<T>
      const scope =
        binder?.bind<T>({
          namespace: contract.namespace,
          ...(contract.client?.decode === undefined ? {} : { decode: contract.client.decode }),
        }) ?? unavailableScope<T>(missing)
      const binding = { scope, describe }
      bindings.set(contract, binding as Binding<unknown>)
      return binding
    },
  }
}

/** Wrap a Slot component with the Settings runtime owned by its Client Fiber. */
export function provideSettingsContext(component: (props: any) => ReactNode, client: SettingsClientRuntime): (props: any) => ReactNode {
  return (props: any) => runtime().createElement(context().Provider, { value: client }, runtime().createElement(component, props))
}

function readError(
  contract: { readonly namespace: string },
  scope: ScopeSnapshot<unknown>,
  mirror: DescribeSnapshot,
  view: NamespaceView | undefined,
): SettingsReadError | null {
  if (mirror.status === 'unavailable') {
    return { kind: 'provider-unavailable', message: mirror.error ?? 'The official Settings provider is unavailable.' }
  }
  if (mirror.error !== null) return { kind: 'sync-failed', message: mirror.error }
  if (mirror.status === 'ready' && view === undefined) {
    return {
      kind: 'namespace-unregistered',
      message: `Settings namespace ${JSON.stringify(contract.namespace)} is not registered by the active Host. Add the contract to defineHost({ settings: [...] }).`,
    }
  }
  if (view !== undefined && scope.status !== 'ready' && scope.revision === view.revision) {
    return {
      kind: 'decode-failed',
      message: `Settings namespace ${JSON.stringify(contract.namespace)} could not decode its redacted Client value.`,
    }
  }
  return null
}

/** Read and mutate one Settings contract through the official shared Client mirror. */
export function useSettings<Schema extends z<any, object>, ClientValue>(
  contract: SettingsContract<Schema, ClientValue>,
): SettingsState<SettingsValue<Schema>, ClientValue> {
  // The Client compiler uses this retained marker after tree-shaking to infer
  // the settingsScope capability without a duplicate defineClient declaration.
  runtime().useDebugValue?.('dshx.settings-hook.v1')
  const client = runtime().useContext(context())
  if (client === undefined) {
    throw new Error(`Settings ${JSON.stringify(contract.namespace)} is unavailable outside a DSHX Client Slot component.`)
  }
  const binding = runtime().useMemo(() => client.binding(contract), [client, contract])
  const scope = runtime().useSyncExternalStore(
    listener => binding.scope.subscribe(listener),
    () => binding.scope.getSnapshot(),
    () => binding.scope.getSnapshot(),
  )
  const mirror = runtime().useSyncExternalStore(
    listener => binding.describe.subscribe(listener),
    () => binding.describe.getSnapshot(),
    () => binding.describe.getSnapshot(),
  )
  runtime().useEffect(() => {
    void binding.describe.ensure()
  }, [binding])

  const namespaceView = mirror.view?.namespaces.find(item => item.ns === contract.namespace)
  const error = readError(contract, scope, mirror, namespaceView)
  const [mutation, setMutation] = runtime().useState<{ readonly pending: boolean; readonly error: unknown | null }>({ pending: false, error: null })
  const pending = runtime().useRef(0)
  const generation = runtime().useRef(0)
  const mounted = runtime().useRef(true)
  runtime().useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )

  const mutate = runtime().useCallback(
    async (operation: () => Promise<void>): Promise<void> => {
      const current = ++generation.current
      pending.current += 1
      setMutation({ pending: true, error: null })
      let failure: unknown
      try {
        await operation()
      } catch (cause) {
        failure = cause
        throw cause
      } finally {
        pending.current -= 1
        if (mounted.current) {
          setMutation(previous => ({
            pending: pending.current > 0,
            error: current === generation.current ? (failure ?? null) : previous.error,
          }))
        }
      }
    },
    [binding],
  )

  const assertAvailable = runtime().useCallback(() => {
    if (error?.kind === 'provider-unavailable' || error?.kind === 'namespace-unregistered') throw new Error(error.message)
  }, [error])

  const set = runtime().useCallback(
    <Key extends keyof SettingsValue<Schema> & string>(field: Key, value: SettingsValue<Schema>[Key]) =>
      mutate(async () => {
        assertAvailable()
        await binding.scope.set(field, value)
      }),
    [assertAvailable, binding, mutate],
  )
  const unset = runtime().useCallback(
    <Key extends keyof SettingsValue<Schema> & string>(field: Key) =>
      mutate(async () => {
        assertAvailable()
        await binding.scope.unset(field)
      }),
    [assertAvailable, binding, mutate],
  )
  const clearError = runtime().useCallback(() => setMutation(previous => ({ ...previous, error: null })), [])

  return {
    ...scope,
    applies: namespaceView?.applies,
    secrets: namespaceView?.secrets ?? [],
    error,
    mutation: { ...mutation, clearError },
    set,
    unset,
  }
}
