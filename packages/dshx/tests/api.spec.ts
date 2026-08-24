import { describe, expect, it, vi } from 'vitest'
import { startApiQueryEffect } from '../src/api/client.js'
import { defineApi, method } from '../src/api/define.js'
import { apiChannel, apiConnectionAvailable, createApiClient, registerApi, subscribeApiConnection } from '../src/api/runtime.js'
import { ApiError } from '../src/api/types.js'

const api = defineApi({
  id: 'status',
  version: 1,
  methods: {
    get: method<void, { value: string }>(),
    refresh: method<{ force?: boolean }, { value: string }>(),
  },
})

describe('generic API runtime', () => {
  it('creates a stable single-segment channel', () => {
    expect(apiChannel('@scope/plugin', 'status')).toMatch(/^\/dshx-[0-9a-f]+$/)
    expect(apiChannel('@scope/plugin', 'status')).toBe(apiChannel('@scope/plugin', 'status'))
    expect(apiChannel('@scope/plugin', 'status')).not.toBe(apiChannel('@scope/plugin', 'other'))
  })

  it('registers handlers through the official Connection shape', async () => {
    let handler: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>) | undefined
    const remove = vi.fn(async () => undefined)
    const ctx = {
      get(name: string) { return name === 'connection' ? { rpc: { handle(_channel: string, value: typeof handler) { handler = value; return remove } } } : undefined },
      effect() { return undefined },
    }
    const registration = api.host({
      async get() { return { value: 'ready' } },
      async refresh({ input }) { return { value: input.force === true ? 'forced' : 'normal' } },
    })
    await registerApi(ctx as never, '@scope/plugin', registration)
    expect(handler).toBeDefined()
    await expect(handler?.('get', { version: 1, input: undefined }, new AbortController().signal)).resolves.toEqual({
      ok: true,
      value: { version: 1, output: { value: 'ready' } },
    })
    await expect(handler?.('get', { version: 2, input: undefined }, new AbortController().signal)).resolves.toMatchObject({
      ok: false,
      error: { code: 'DSHX6401' },
    })
  })

  it('releases channel ownership with the Host fiber lifecycle', async () => {
    const disposers: Array<() => Promise<void>> = []
    const remove = vi.fn(async () => undefined)
    const ctx = {
      get(name: string) {
        return name === 'connection' ? { rpc: { handle: vi.fn(() => remove) } } : undefined
      },
      effect(setup: () => () => Promise<void>) {
        disposers.push(setup())
      },
    }
    const registration = api.host({
      async get() { return { value: 'ready' } },
      async refresh() { return { value: 'ready' } },
    })
    // These package ids are a deterministic FNV-1a collision for the status API.
    const first = 'pkg-ppsie4'
    const second = 'pkg-1m7n0mo'
    expect(apiChannel(first, 'status')).toBe(apiChannel(second, 'status'))
    await registerApi(ctx as never, first, registration)
    await expect(registerApi(ctx as never, second, registration)).rejects.toThrow('API channel collision')
    await disposers[0]?.()
    await expect(registerApi(ctx as never, second, registration)).resolves.toBeUndefined()
    expect(remove).toHaveBeenCalledOnce()
  })

  it('provides typed calls and safe errors over Connection.call', async () => {
    const call = vi.fn(async (_channel: string, endpoint: string): Promise<
      | { readonly ok: true; readonly value: unknown }
      | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
    > => ({
      ok: true,
      value: { version: 1, output: { value: endpoint } },
    }))
    const client = createApiClient({ get(name: string) { return name === 'connection' ? { rpc: { call } } : undefined } } as never, api, '@scope/plugin')
    await expect(client.get()).resolves.toEqual({ value: 'get' })
    await expect(client.refresh({ force: true })).resolves.toEqual({ value: 'refresh' })
    expect(call).toHaveBeenCalledWith(apiChannel('@scope/plugin', 'status'), 'get', { version: 1, input: undefined }, undefined)

    call.mockResolvedValueOnce({ ok: false, error: { code: 'internal', message: 'boom' } })
    const result = await client.safe.get()
    expect(result).toMatchObject({ ok: false, error: { kind: 'remote', remoteCode: 'internal' } })
  })

  it('uses an unambiguous AbortSignal position for no-input methods', async () => {
    const call = vi.fn(async (): Promise<{ readonly ok: true; readonly value: unknown }> => ({
      ok: true,
      value: { version: 1, output: { value: 'ready' } },
    }))
    const client = createApiClient({ get(name: string) { return name === 'connection' ? { rpc: { call } } : undefined } } as never, api, '@scope/plugin')
    const controller = new AbortController()
    controller.abort('cancelled before dispatch')
    await expect(client.get(undefined, { signal: controller.signal })).rejects.toMatchObject({ kind: 'aborted', retryable: false })
    expect(call).not.toHaveBeenCalled()
  })

  it('maps Host and Client API version mismatches to contract errors', async () => {
    let handler: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<any>) | undefined
    const host = defineApi({ id: 'versioned', version: 1, methods: { get: method<void, string>() } })
    const clientContract = defineApi({ id: 'versioned', version: 2, methods: { get: method<void, string>() } })
    const context = {
      get(name: string) {
        return name === 'connection' ? {
          rpc: {
            handle(_channel: string, value: typeof handler) { handler = value; return async () => undefined },
            call(_channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) {
              return handler?.(endpoint, payload, signal ?? new AbortController().signal)
            },
          },
        } : undefined
      },
      effect(setup: () => unknown) { setup() },
    }
    await registerApi(context as never, '@scope/plugin', host.host({ async get() { return 'ready' } }))
    const client = createApiClient(context as never, clientContract, '@scope/plugin')
    await expect(client.get()).rejects.toMatchObject({ kind: 'contract', remoteCode: 'DSHX6401', retryable: false })
  })

  it('returns Standard Schema transformed output from the Host boundary', async () => {
    let handler: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<any>) | undefined
    const transformed = defineApi({
      id: 'transformed',
      version: 1,
      methods: {
        get: method<void, string>({
          output: { '~standard': { validate: value => ({ value: String(value).toUpperCase() }) } },
        }),
      },
    })
    const context = {
      get(name: string) {
        return name === 'connection' ? { rpc: { handle(_channel: string, value: typeof handler) { handler = value; return async () => undefined } } } : undefined
      },
      effect(setup: () => unknown) { setup() },
    }
    await registerApi(context as never, '@scope/plugin', transformed.host({ async get() { return 'ready' } }))
    await expect(handler?.('get', { version: 1 }, new AbortController().signal)).resolves.toMatchObject({
      ok: true,
      value: { output: 'READY' },
    })
  })

  it('maps JSON-safe and schema failures to contract errors', async () => {
    const call = vi.fn(async (): Promise<{ readonly ok: true; readonly value: unknown }> => ({
      ok: true,
      value: { version: 1, output: { value: 'ready' } },
    }))
    const contract = defineApi({
      id: 'validated',
      version: 1,
      methods: {
        get: method<{ readonly accepted?: boolean }, { value: string }>({
          input: { '~standard': { validate: () => ({ issues: [{ message: 'nope' }] }) } },
        }),
      },
    })
    const client = createApiClient({ get(name: string) { return name === 'connection' ? { rpc: { call } } : undefined } } as never, contract, '@scope/plugin')
    await expect(client.get({})).rejects.toMatchObject({ kind: 'contract', retryable: false })
    expect(call).not.toHaveBeenCalled()
  })

  it('exposes the official Host description lifecycle to query adapters', () => {
    let connected = false
    const listeners = new Set<() => void>()
    const client = createApiClient({ get(name: string) {
      return name === 'connection' ? {
        hostDescription: {
          getSnapshot: () => connected ? { profile: 'web' } : undefined,
          subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) },
        },
        rpc: { call: vi.fn() },
      } : undefined
    } } as never, api, '@scope/plugin')
    const listener = vi.fn()
    const dispose = subscribeApiConnection(client, listener)
    expect(apiConnectionAvailable(client)).toBe(false)
    connected = true
    for (const callback of listeners) callback()
    expect(listener).toHaveBeenCalledOnce()
    expect(apiConnectionAvailable(client)).toBe(true)
    dispose()
    expect(listeners).toHaveLength(0)
  })

  it('waits for a Host generation before asking React to retry a query', () => {
    let connected = false
    const listeners = new Set<() => void>()
    const invoke = vi.fn(async () => 'ready')
    const onReconnect = vi.fn()
    const dispose = startApiQueryEffect({
      available: () => connected,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
      invoke,
      onLoading: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
      onReconnect,
    })
    expect(invoke).not.toHaveBeenCalled()
    connected = true
    for (const listener of listeners) listener()
    for (const listener of listeners) listener()
    expect(onReconnect).toHaveBeenCalledOnce()
    dispose()
    expect(listeners).toHaveLength(0)
  })

  it('aborts an in-flight query on connection loss and retries on the next generation', async () => {
    let connected = true
    const listeners = new Set<() => void>()
    let requestSignal: AbortSignal | undefined
    const onLoading = vi.fn()
    const onError = vi.fn()
    const onReconnect = vi.fn()
    const dispose = startApiQueryEffect({
      available: () => connected,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
      invoke(signal) {
        requestSignal = signal
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new ApiError('aborted', 'aborted', 'status', 'get', false)), { once: true })
        })
      },
      onLoading,
      onSuccess: vi.fn(),
      onError,
      onReconnect,
    })
    expect(requestSignal?.aborted).toBe(false)
    connected = false
    for (const listener of listeners) listener()
    await Promise.resolve()
    expect(requestSignal?.aborted).toBe(true)
    expect(onLoading).toHaveBeenCalledTimes(2)
    expect(onError).not.toHaveBeenCalled()
    connected = true
    for (const listener of listeners) listener()
    expect(onReconnect).toHaveBeenCalledOnce()
    dispose()
  })
})
