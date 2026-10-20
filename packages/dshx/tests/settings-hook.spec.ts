import Schema from '@deepseek-ai/schemastery'
import React from 'react'
import type { SettingsClientRuntime } from '../src/settings/client.js'
import { createSettingsClientRuntime, useSettings } from '../src/settings/client.js'
import { defineSettings } from '../src/settings/index.js'
import type { SettingsContract, SettingsFormValue, SettingsState } from '../src/settings/types.js'
import { afterAll, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

type Setter<T> = T | ((previous: T) => T)

let currentClient: SettingsClientRuntime
const hookState: unknown[] = []
const hookRefs: Array<{ current: unknown }> = []
let stateCursor = 0
let refCursor = 0

const fakeReact = {
  useContext: () => currentClient,
  useDebugValue: () => undefined,
  useMemo: <T>(factory: () => T): T => factory(),
  useSyncExternalStore: <T>(_subscribe: unknown, snapshot: () => T): T => snapshot(),
  useEffect: () => undefined,
  useCallback: <T>(callback: T): T => callback,
  useState: <T>(initial: T): [T, (next: Setter<T>) => void] => {
    const index = stateCursor++
    if (!(index in hookState)) hookState[index] = initial
    return [
      hookState[index] as T,
      next => {
        const previous = hookState[index] as T
        hookState[index] = typeof next === 'function' ? (next as (value: T) => T)(previous) : next
      },
    ]
  },
  useRef: <T>(initial: T): { current: T } => {
    const index = refCursor++
    if (!(index in hookRefs)) hookRefs[index] = { current: initial }
    return hookRefs[index] as { current: T }
  },
}

const reactInternals = React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentDispatcher: { current: unknown }
  }
}
const originalDispatcher = reactInternals.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher.current

function resetRender(): void {
  stateCursor = 0
  refCursor = 0
}

const ENTRY_ID = 'feature-entry'

type FormSnapshot = {
  status: 'loading' | 'ready' | 'unavailable'
  value: Record<string, unknown> | undefined
  base: unknown
  user: unknown
  revision: number | undefined
  writable: boolean
}

function formSnapshot(overrides: Partial<FormSnapshot> = {}): FormSnapshot {
  return {
    status: 'ready',
    value: { enabled: true },
    base: { enabled: true },
    user: undefined,
    revision: 2,
    writable: true,
    ...overrides,
  }
}

function mirrorSnapshot(overrides: {
  status?: 'idle' | 'loading' | 'ready'
  namespaces?: readonly Record<string, unknown>[]
  writable?: boolean
  error?: string | null
} = {}): Record<string, unknown> {
  return {
    status: overrides.status ?? 'ready',
    view: {
      namespaces: overrides.namespaces ?? [{ ns: ENTRY_ID, applies: 'live', secrets: [], revision: 2 }],
      writable: overrides.writable ?? true,
      hasDocument: true,
    },
    error: overrides.error ?? null,
  }
}

function formWith(overrides: Partial<FormSnapshot> = {}) {
  const snapshots = [formSnapshot(overrides)]
  return {
    getSnapshot: () => snapshots[0]!,
    subscribe: () => () => undefined,
    set: vi.fn(() => Promise.resolve(true)),
    unset: vi.fn(() => Promise.resolve(true)),
    mutate: vi.fn(() => Promise.resolve(true)),
  }
}

function installClient(options: {
  readonly form?: ReturnType<typeof formWith>
  readonly mirror?: Record<string, unknown>
  readonly entryId?: string | null
  readonly provider?: boolean
}): SettingsClientRuntime {
  const settingsNamespace = options.entryId === null ? undefined : (options.entryId ?? ENTRY_ID)
  const form = options.form ?? formWith()
  const mirror = options.mirror ?? mirrorSnapshot()
  const ctx = {
    get: (name: string) =>
      options.provider === false || name !== 'configForms'
        ? undefined
        : {
            get: () => form,
            describe: () => ({
              getSnapshot: () => mirror,
              subscribe: () => () => undefined,
              ensure: () => Promise.resolve(),
            }),
          },
  }
  currentClient = createSettingsClientRuntime(ctx, settingsNamespace)
  return currentClient
}

function render<Schema extends Parameters<typeof useSettings>[0]['schema']>(
  contract: SettingsContract<Schema>,
): SettingsState<SettingsFormValue<Schema>> {
  resetRender()
  return useSettings(contract)
}

beforeEach(() => {
  hookState.length = 0
  hookRefs.length = 0
  reactInternals.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher.current = fakeReact
})

afterAll(() => {
  reactInternals.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher.current = originalDispatcher
})

describe('useSettings', () => {
  it('reads the shared Config form and tracks pending writes without optimistic values', async () => {
    const contract = defineSettings({ schema: Schema.object({ enabled: Schema.boolean().default(true) }) })
    let resolveWrite: ((accepted: boolean) => void) | undefined
    const form = formWith()
    form.set.mockImplementation(
      () =>
        new Promise<boolean>(resolve => {
          resolveWrite = resolve
        }),
    )
    installClient({ form })

    const initial = render(contract)
    expect(initial.value).toEqual({ enabled: true })
    expect(initial.error).toBeNull()
    expect(initial.status).toBe('ready')

    const write = initial.set('enabled', false)
    expect(render(contract).mutation.pending).toBe(true)
    expect(render(contract).value).toEqual({ enabled: true })
    resolveWrite?.(true)
    await expect(write).resolves.toBe(true)
    expect(render(contract).mutation).toEqual({ pending: false })
    expect(form.set).toHaveBeenCalledWith('enabled', false)

    form.set.mockRejectedValueOnce(new Error('write failed'))
    await expect(render(contract).set('enabled', true)).rejects.toThrow('write failed')
    expect(render(contract).mutation).toEqual({ pending: false })
  })

  it('does not write while the form is unwritable or the namespace is absent', async () => {
    const contract = defineSettings({ schema: Schema.object({ enabled: Schema.boolean() }) })
    const form = formWith({ status: 'unavailable', writable: false })
    installClient({ form, mirror: mirrorSnapshot({ namespaces: [] }) })

    const state = render(contract)
    expect(state.status).toBe('unavailable')
    expect(state.writable).toBe(false)
    expect(state.error?.kind).toBe('entry-unresolved')
    await expect(state.set('enabled', true)).rejects.toThrow('Config form')
    await expect(state.unset('enabled')).rejects.toThrow('Config form')
    expect(form.set).not.toHaveBeenCalled()
    expect(form.unset).not.toHaveBeenCalled()
  })

  it('distinguishes missing providers, unresolved entries, decode failures, and mirror errors', () => {
    const contract = defineSettings({ schema: Schema.object({ enabled: Schema.boolean() }) })

    installClient({ provider: false })
    expect(render(contract)).toMatchObject({ status: 'unavailable', writable: false, error: { kind: 'provider-unavailable' } })

    installClient({ entryId: null })
    expect(render(contract)).toMatchObject({ status: 'unavailable', error: { kind: 'entry-unresolved' } })

    installClient({ form: formWith({ status: 'loading', value: undefined }) })
    expect(render(contract)).toMatchObject({ status: 'unavailable', error: { kind: 'decode-failed' } })

    installClient({ mirror: mirrorSnapshot({ error: 'refresh failed' }) })
    expect(render(contract).error).toMatchObject({ kind: 'sync-failed', message: 'refresh failed' })
  })

  it('exposes the redacted secret positions and the revision fence', () => {
    const schema = Schema.object({ token: Schema.string().role('secret') })
    const contract = defineSettings({ schema })
    installClient({
      form: formWith({ value: {}, revision: 7 }),
      mirror: mirrorSnapshot({
        namespaces: [{ ns: ENTRY_ID, applies: 'live', secrets: [{ path: ['token'], set: true }], revision: 7 }],
      }),
    })

    const state = render(contract)
    expect(state.revision).toBe(7)
    expect(state.secrets).toEqual([{ path: ['token'], set: true }])
    expectTypeOf(state.value).toEqualTypeOf<{ readonly token: string } | undefined>()
  })
})
