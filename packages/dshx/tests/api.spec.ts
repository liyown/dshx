import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createApiClientRuntime, startApiQueryEffect } from '../src/api/client.js'
import { defineApi, method } from '../src/api/define.js'
import * as publicApi from '../src/api/index.js'
import { apiChannel, apiConnectionAvailable, createApiClient, registerApi, subscribeApiConnection } from '../src/api/runtime.js'

function schema<Input, Output>(validate: (value: unknown) => StandardSchemaV1.Result<Output>): StandardSchemaV1<Input, Output> {
  return { '~standard': { version: 1, vendor: 'dshx-test', validate } }
}

const api = defineApi({
  id: 'status',
  version: 1,
  methods: {
    get: method<void, { value: string }>(),
    refresh: method<{ force?: boolean }, { value: string }>(),
  },
})

describe('generic API runtime', () => {
  it('does not expose transport construction helpers', () => {
    expect(publicApi).not.toHaveProperty('createApiClient')
    expect(publicApi).not.toHaveProperty('registerApi')
    expect(publicApi).not.toHaveProperty('apiChannel')
  })
  it('creates a stable single-segment channel', () => {
    expect(apiChannel('@scope/plugin', 'status')).toMatch(/^\/dshx-[0-9a-f]+$/)
    expect(apiChannel('@scope/plugin', 'status')).toBe(apiChannel('@scope/plugin', 'status'))
    expect(apiChannel('@scope/plugin', 'status')).not.toBe(apiChannel('@scope/plugin', 'other'))
  })

  it('registers handlers through the official Connection shape', async () => {
    let handler: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>) | undefined
    const remove = vi.fn(async () => undefined)
    const ctx = {
      get(name: string) {
        return name === 'connection'
          ? {
              rpc: {
                handle(_channel: string, value: typeof handler) {
                  handler = value
                  return remove
                },
              },
            }
          : undefined
      },
      effect() {
        return undefined
      },
    }
    const registration = api.host({
      async get() {
        return { value: 'ready' }
      },
      async refresh({ input }) {
        return { value: input.force === true ? 'forced' : 'normal' }
      },
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
      async get() {
        return { value: 'ready' }
      },
      async refresh() {
        return { value: 'ready' }
      },
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
    const call = vi.fn(
      async (
        _channel: string,
        endpoint: string,
      ): Promise<
        { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
      > => ({
        ok: true,
        value: { version: 1, output: { value: endpoint } },
      }),
    )
    const client = createApiClient(
      {
        get(name: string) {
          return name === 'connection' ? { rpc: { call } } : undefined
        },
      } as never,
      api,
      '@scope/plugin',
    )
    await expect(client.get()).resolves.toEqual({ value: 'get' })
    await expect(client.refresh({ force: true })).resolves.toEqual({ value: 'refresh' })
    expect(call).toHaveBeenCalledWith(apiChannel('@scope/plugin', 'status'), 'get', { version: 1, input: undefined }, undefined)

    call.mockResolvedValueOnce({ ok: false, error: { code: 'internal', message: 'boom' } })
    const result = await client.safe.get()
    expect(result).toMatchObject({ ok: false, error: { kind: 'remote', remoteCode: 'internal' } })
  })

  it('lazily reuses API clients by contract identity within one Client Fiber runtime', () => {
    const get = vi.fn(() => ({ rpc: { call: vi.fn() } }))
    const firstRuntime = createApiClientRuntime({ get }, '@scope/plugin')
    const sameShape = defineApi({
      id: 'status-copy',
      version: 1,
      methods: {
        get: method<void, { value: string }>(),
        refresh: method<{ force?: boolean }, { value: string }>(),
      },
    })

    const first = firstRuntime.client(api)
    expect(firstRuntime.client(api)).toBe(first)
    expect(firstRuntime.client(sameShape)).not.toBe(first)
    expect(get).toHaveBeenCalledTimes(2)

    const nextRuntime = createApiClientRuntime({ get }, '@scope/plugin')
    expect(nextRuntime.client(api)).not.toBe(first)
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('does not eagerly bind contracts before useApi requests one', () => {
    const get = vi.fn(() => ({ rpc: { call: vi.fn() } }))
    const client = createApiClientRuntime({ get }, '@scope/plugin')
    expect(get).not.toHaveBeenCalled()
    expect(client.client(api)).toBe(client.client(api))
    expect(get).toHaveBeenCalledOnce()
  })

  it('uses an unambiguous AbortSignal position for no-input methods', async () => {
    const call = vi.fn(async (): Promise<{ readonly ok: true; readonly value: unknown }> => ({
      ok: true,
      value: { version: 1, output: { value: 'ready' } },
    }))
    const client = createApiClient(
      {
        get(name: string) {
          return name === 'connection' ? { rpc: { call } } : undefined
        },
      } as never,
      api,
      '@scope/plugin',
    )
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
        return name === 'connection'
          ? {
              rpc: {
                handle(_channel: string, value: typeof handler) {
                  handler = value
                  return async () => undefined
                },
                call(_channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) {
                  return handler?.(endpoint, payload, signal ?? new AbortController().signal)
                },
              },
            }
          : undefined
      },
      effect(setup: () => unknown) {
        setup()
      },
    }
    await registerApi(
      context as never,
      '@scope/plugin',
      host.host({
        async get() {
          return 'ready'
        },
      }),
    )
    const client = createApiClient(context as never, clientContract, '@scope/plugin')
    await expect(client.get()).rejects.toMatchObject({ kind: 'contract', remoteCode: 'DSHX6401', retryable: false })
  })

  it('returns Standard Schema transformed output from the Host boundary', async () => {
    let handler: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<any>) | undefined
    const validateOutput = vi.fn((value: unknown) => ({ value: String(value).toUpperCase() }))
    const transformed = defineApi({
      id: 'transformed',
      version: 1,
      methods: {
        get: method({ output: schema<string, string>(validateOutput) }),
      },
    })
    const context = {
      get(name: string) {
        return name === 'connection'
          ? {
              rpc: {
                handle(_channel: string, value: typeof handler) {
                  handler = value
                  return async () => undefined
                },
              },
            }
          : undefined
      },
      effect(setup: () => unknown) {
        setup()
      },
    }
    await registerApi(
      context as never,
      '@scope/plugin',
      transformed.host({
        async get() {
          return 'ready'
        },
      }),
    )
    await expect(handler?.('get', { version: 1 }, new AbortController().signal)).resolves.toMatchObject({
      ok: true,
      value: { output: 'READY' },
    })
    expect(validateOutput).toHaveBeenCalledOnce()
  })

  it('checks the JSON boundary before transforming Client input into a Host-only value', async () => {
    let handler: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<any>) | undefined
    const transformed = defineApi({
      id: 'host-input-transform',
      version: 1,
      methods: {
        parse: method({
          input: schema<{ raw: string }, { parsed: bigint }>(value => ({
            value: { parsed: BigInt((value as { raw: string }).raw) },
          })),
        }),
      },
    })
    const context = {
      get: () => ({
        rpc: {
          handle(_channel: string, value: typeof handler) {
            handler = value
            return async () => undefined
          },
        },
      }),
      effect(setup: () => unknown) {
        setup()
      },
    }
    const implementation = vi.fn(({ input }: { input: { parsed: bigint } }) => input.parsed.toString())
    await registerApi(context as never, '@scope/plugin', transformed.host({ parse: implementation }))

    await expect(handler?.('parse', { version: 1, input: { raw: '9007199254740993' } }, new AbortController().signal)).resolves.toMatchObject({
      ok: true,
      value: { output: '9007199254740993' },
    })
    expect(implementation).toHaveBeenCalledWith(expect.objectContaining({ input: { parsed: 9007199254740993n } }))
  })

  it('maps JSON-safe and schema failures to contract errors', async () => {
    let handler: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<any>) | undefined
    const validateInput = vi.fn(() => ({ issues: [{ message: 'nope' }] }))
    const contract = defineApi({
      id: 'validated',
      version: 1,
      methods: {
        get: method({ input: schema<{ readonly accepted?: boolean }, { readonly accepted: boolean }>(validateInput) }),
      },
    })
    const context = {
      get: () => ({
        rpc: {
          handle(_channel: string, value: typeof handler) {
            handler = value
            return async () => undefined
          },
          call(_channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) {
            return handler?.(endpoint, payload, signal ?? new AbortController().signal)
          },
        },
      }),
      effect(setup: () => unknown) {
        setup()
      },
    }
    await registerApi(context as never, '@scope/plugin', contract.host({ get: () => ({ value: 'ready' }) }))
    const client = createApiClient(context as never, contract, '@scope/plugin')
    await expect(client.get({})).rejects.toMatchObject({ kind: 'contract', retryable: false })
    expect(validateInput).toHaveBeenCalledOnce()
  })

  it('exposes the official Host description lifecycle to query adapters', () => {
    let connected = false
    const listeners = new Set<() => void>()
    const client = createApiClient(
      {
        get(name: string) {
          return name === 'connection'
            ? {
                hostDescription: {
                  getSnapshot: () => (connected ? { profile: 'web' } : undefined),
                  subscribe(listener: () => void) {
                    listeners.add(listener)
                    return () => listeners.delete(listener)
                  },
                },
                rpc: { call: vi.fn() },
              }
            : undefined
        },
      } as never,
      api,
      '@scope/plugin',
    )
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
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      invoke,
      onPending: vi.fn(),
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
    const onPending = vi.fn()
    const onError = vi.fn()
    const onReconnect = vi.fn()
    const dispose = startApiQueryEffect({
      available: () => connected,
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      invoke(signal) {
        requestSignal = signal
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
      },
      onPending,
      onSuccess: vi.fn(),
      onError,
      onReconnect,
    })
    expect(requestSignal?.aborted).toBe(false)
    connected = false
    for (const listener of listeners) listener()
    await Promise.resolve()
    expect(requestSignal?.aborted).toBe(true)
    expect(onPending).toHaveBeenCalledTimes(2)
    expect(onError).not.toHaveBeenCalled()
    connected = true
    for (const listener of listeners) listener()
    expect(onReconnect).toHaveBeenCalledOnce()
    dispose()
  })

  it('infers all four Standard Schema stages and checks exact handlers', () => {
    const input = schema<{ raw: string }, { parsed: number }>(value => ({ value: { parsed: Number((value as { raw: string }).raw) } }))
    const output = schema<{ count: number }, { text: string }>(value => ({ value: { text: String((value as { count: number }).count) } }))
    const contract = defineApi({ id: 'four-stage', version: 1, methods: { convert: method({ input, output }) } })
    contract.host({
      convert({ input: hostInput }) {
        expectTypeOf(hostInput).toEqualTypeOf<{ parsed: number }>()
        return { count: hostInput.parsed }
      },
    })
    const client = createApiClient(undefined, contract)
    expectTypeOf(client.convert).parameter(0).toEqualTypeOf<{ raw: string }>()
    expectTypeOf(client.convert).returns.resolves.toEqualTypeOf<{ text: string }>()
    expect(() => contract.host({ convert: () => ({ count: 1 }), extra: () => 1 } as never)).toThrow('unexpected')
  })
})
