import type { ApiContract, ApiHandlers, ApiHostOptions, ApiHostRegistration, ApiMethodDefinition, ApiMethodOptions } from './types.js'

export function method<I = void, O = unknown>(): ApiMethodDefinition<I, O>
export function method<I, O>(options: ApiMethodOptions<I, O>): ApiMethodDefinition<I, O>
export function method<I, O>(options: ApiMethodOptions<I, O> = {}): ApiMethodDefinition<I, O> {
  return { ...options }
}

function assertId(id: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(id) || id.includes('/')) {
    throw new Error(`Invalid API id ${JSON.stringify(id)}; use a stable single-segment identifier.`)
  }
}

export function defineApi<const Methods extends Record<string, ApiMethodDefinition<any, any>>>(definition: {
  readonly id: string
  readonly version: number
  readonly methods: Methods
}): ApiContract<Methods> {
  assertId(definition.id)
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new Error(`API ${JSON.stringify(definition.id)} version must be a positive integer.`)
  }
  return {
    ...definition,
    host<Handlers extends ApiHandlers<Methods>>(handlers: Handlers, options: ApiHostOptions = {}): ApiHostRegistration<Methods, Handlers> {
      for (const name of Object.keys(definition.methods)) {
        if (typeof handlers[name] !== 'function') {
          throw new Error(`API ${JSON.stringify(definition.id)} is missing handler ${JSON.stringify(name)}.`)
        }
      }
      return {
        kind: 'api',
        contract: this,
        handlers,
        authority: options.authority ?? 'loopback',
      }
    },
  }
}
