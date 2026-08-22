import { describe, expect, it, vi } from 'vitest'
import { defineApi, method } from '../src/api/define.js'
import { apiChannel, apiConnectionAvailable, createApiClient, registerApi, subscribeApiConnection } from '../src/api/runtime.js'

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
})
