import type { ReactNode } from 'react'
import type z from '@deepseek-ai/schemastery'
import type {
  ConfigForm as OfficialConfigForm,
  ConfigFormSnapshot as OfficialConfigFormSnapshot,
  SettingsDescribeFace as OfficialSettingsDescribeFace,
} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {
  SettingsContract,
  SettingsFormValue,
  SettingsMutationState,
  SettingsPathOp,
  SettingsReadError,
  SettingsSecretState,
  SettingsState,
} from './types.js'

type ReactRuntime = typeof import('react')
declare const require: ((name: string) => ReactRuntime) | undefined

type ConfigFormSnapshot = OfficialConfigFormSnapshot<Record<string, unknown>>
type ConfigForm = OfficialConfigForm<Record<string, unknown>>
type SettingsDescribeFace = Pick<OfficialSettingsDescribeFace, 'getSnapshot' | 'subscribe' | 'ensure'>
type SettingsMirrorSnapshot = ReturnType<SettingsDescribeFace['getSnapshot']>
type NamespaceView = SettingsMirrorSnapshot extends { view: infer View }
  ? NonNullable<View> extends { namespaces: readonly (infer Item)[] }
    ? Item
    : never
  : never

interface ConfigFormsService {
  get<T>(entryId: string): OfficialConfigForm<T>
  describe(): SettingsDescribeFace
}

interface ContextLike {
  get(name: string): unknown
}

interface Binding {
  readonly form: ConfigForm
  readonly describe: SettingsDescribeFace
}

export interface SettingsClientRuntime {
  /** Whether DSH serves the Client Config form provider at all. */
  readonly available: boolean
  /** Whether the runtime could resolve this plugin's Host entry. */
  readonly entryId: string | undefined
  binding(contract: SettingsContract<z<any, object>>): Binding
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

function unavailableForm(): ConfigForm {
  const snapshot: ConfigFormSnapshot = {
    status: 'loading',
    value: undefined,
    base: undefined,
    user: undefined,
    revision: undefined,
    writable: false,
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    set: () => Promise.resolve(false),
    unset: () => Promise.resolve(false),
    mutate: () => Promise.resolve(false),
  }
}

function unavailableDescribe(): SettingsDescribeFace {
  return {
    getSnapshot: () => ({ status: 'idle', view: undefined, error: null }),
    subscribe: () => () => undefined,
    ensure: () => Promise.resolve(),
  }
}

/**
 * Create one per-Client binding over the official Config forms of this plugin entry.
 * @param ctx - the Client fiber context that provides `configForms`.
 * @param settingsNamespace - profile entry id owning the Host Config form; the
 * Client compiler embeds the id declared in the bundle patch, because DSH
 * namespaces forms by host Loader entry rather than by browser module row.
 */
export function createSettingsClientRuntime(ctx: ContextLike, settingsNamespace?: string): SettingsClientRuntime {
  const forms = ctx.get('configForms') as ConfigFormsService | undefined
  const entryId = settingsNamespace
  const describe = forms?.describe() ?? unavailableDescribe()
  const form = forms === undefined || entryId === undefined ? undefined : forms.get<Record<string, unknown>>(entryId)
  const bindings = new WeakMap<object, Binding>()
  return {
    available: forms !== undefined,
    entryId,
    binding(contract: SettingsContract<z<any, object>>): Binding {
      const existing = bindings.get(contract)
      if (existing !== undefined) return existing
      const binding = { form: form ?? unavailableForm(), describe }
      bindings.set(contract, binding)
      return binding
    },
  }
}

/** Wrap a Slot component with the Settings runtime owned by its Client Fiber. */
export function provideSettingsContext(component: (props: any) => ReactNode, client: SettingsClientRuntime): (props: any) => ReactNode {
  return (props: any) => runtime().createElement(context().Provider, { value: client }, runtime().createElement(component, props))
}

function secretStates(view: NamespaceView | undefined): readonly SettingsSecretState[] {
  const secrets = (view as { readonly secrets?: readonly { readonly path: readonly string[]; readonly set: boolean }[] } | undefined)?.secrets
  return secrets?.map(item => ({ path: item.path, set: item.set })) ?? []
}

function readError(
  available: boolean,
  entryId: string | undefined,
  form: ConfigFormSnapshot,
  mirror: SettingsMirrorSnapshot,
  view: NamespaceView | undefined,
): SettingsReadError | null {
  if (!available) {
    return {
      kind: 'provider-unavailable',
      message: 'DSH ui-settings did not provide ctx.configForms, so this Config form cannot be read.',
    }
  }
  if (entryId === undefined) {
    return {
      kind: 'entry-unresolved',
      message: "DSHX could not resolve this plugin's profile entry id, so its Config form cannot be read.",
    }
  }
  if (mirror.error !== null) return { kind: 'sync-failed', message: mirror.error }
  if (mirror.status === 'ready' && view === undefined) {
    return {
      kind: 'entry-unresolved',
      message: `Profile entry ${JSON.stringify(entryId)} serves no Config form. Declare the schema in defineHost({ config: defineSettings({ ... }) }) and load this plugin from that entry.`,
    }
  }
  if (view !== undefined && form.status === 'loading') {
    return {
      kind: 'decode-failed',
      message: `Config entry ${JSON.stringify(entryId)} could not decode its value against the served schema.`,
    }
  }
  return null
}

/**
 * Read and mutate this plugin's Config through the official shared Client forms.
 * @param contract - the contract declared in shared source and used by defineHost({ config }).
 */
export function useSettings<Schema extends z<any, object>>(contract: SettingsContract<Schema>): SettingsState<SettingsFormValue<Schema>> {
  const client = runtime().useContext(context())
  if (client === undefined) {
    throw new Error('useSettings() is unavailable outside a DSHX Client Slot component.')
  }
  const binding = runtime().useMemo(() => client.binding(contract as SettingsContract<z<any, object>>), [client, contract])
  const form = runtime().useSyncExternalStore(
    listener => binding.form.subscribe(listener),
    () => binding.form.getSnapshot(),
    () => binding.form.getSnapshot(),
  )
  const mirror = runtime().useSyncExternalStore(
    listener => binding.describe.subscribe(listener),
    () => binding.describe.getSnapshot(),
    () => binding.describe.getSnapshot(),
  )
  runtime().useEffect(() => {
    void binding.describe.ensure()
  }, [binding])

  const view = mirror.view?.namespaces.find(item => item.ns === client.entryId)
  const error = readError(client.available, client.entryId, form, mirror, view)
  const [mutationPending, setMutationPending] = runtime().useState(false)
  const pending = runtime().useRef(0)
  const mounted = runtime().useRef(true)
  runtime().useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )

  const mutate = runtime().useCallback(async (operation: () => Promise<boolean>): Promise<boolean> => {
    pending.current += 1
    setMutationPending(true)
    try {
      return await operation()
    } finally {
      pending.current -= 1
      if (mounted.current) setMutationPending(pending.current > 0)
    }
  }, [])

  const writable =
    form.writable && mirror.view?.writable === true && view !== undefined && error?.kind !== 'entry-unresolved' && error?.kind !== 'decode-failed'
  const status: SettingsState<SettingsFormValue<Schema>>['status'] =
    error?.kind === 'entry-unresolved' || error?.kind === 'decode-failed' || error?.kind === 'provider-unavailable'
      ? 'unavailable'
      : form.status === 'ready'
        ? 'ready'
        : form.status
  const assertWritable = runtime().useCallback(() => {
    if (!writable) throw new Error(error?.message ?? 'This Config form is not writable.')
  }, [error, writable])

  const set = runtime().useCallback(
    <Key extends keyof SettingsFormValue<Schema> & string>(field: Key, value: SettingsFormValue<Schema>[Key]) =>
      mutate(async () => {
        assertWritable()
        return binding.form.set(field, value)
      }),
    [assertWritable, binding, mutate],
  )
  const unset = runtime().useCallback(
    <Key extends keyof SettingsFormValue<Schema> & string>(field: Key) =>
      mutate(async () => {
        assertWritable()
        return binding.form.unset(field)
      }),
    [assertWritable, binding, mutate],
  )
  const applyOps = runtime().useCallback(
    (ops: readonly SettingsPathOp[], expectedRevision?: number) =>
      mutate(async () => {
        assertWritable()
        return binding.form.mutate(ops as never, expectedRevision)
      }),
    [assertWritable, binding, mutate],
  )

  const mutation: SettingsMutationState = { pending: mutationPending }
  return {
    status,
    value: form.value as SettingsFormValue<Schema> | undefined,
    base: form.base,
    user: form.user,
    revision: form.revision,
    writable,
    secrets: secretStates(view),
    error,
    mutation,
    set,
    unset,
    mutate: applyOps,
  }
}
