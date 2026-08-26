import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  AnyApiMethodDefinition,
  ApiContract,
  ApiHandlers,
  ApiHostOptions,
  ApiHostRegistration,
  ApiMethodDefinition,
  ApiMethodOptions,
  ApiSchema,
} from './types.js'

export interface ApiHostRegistrationParts {
  readonly contract: ApiContract
  readonly handlers: ApiHandlers<Record<string, AnyApiMethodDefinition>>
  readonly authority: 'loopback' | 'trusted-host'
}

const apiHostRegistrations = new WeakMap<object, ApiHostRegistrationParts>()

type SchemaInput<Schema> = Schema extends StandardSchemaV1<infer Input, any> ? Input : never
type SchemaOutput<Schema> = Schema extends StandardSchemaV1<any, infer Output> ? Output : never
type InputSchemaOf<Options> = Options extends { readonly input: infer Schema extends ApiSchema } ? Schema : undefined
type OutputSchemaOf<Options> = Options extends { readonly output: infer Schema extends ApiSchema } ? Schema : undefined
type MethodFromOptions<Options extends ApiMethodOptions> = ApiMethodDefinition<
  InputSchemaOf<Options> extends ApiSchema ? SchemaInput<InputSchemaOf<Options>> : void,
  InputSchemaOf<Options> extends ApiSchema ? SchemaOutput<InputSchemaOf<Options>> : void,
  OutputSchemaOf<Options> extends ApiSchema ? SchemaInput<OutputSchemaOf<Options>> : unknown,
  OutputSchemaOf<Options> extends ApiSchema ? SchemaOutput<OutputSchemaOf<Options>> : unknown
>

export function method<I = void, O = unknown>(): ApiMethodDefinition<I, I, O, O>
export function method<const Options extends ApiMethodOptions>(options: Options): MethodFromOptions<Options>
export function method(options: ApiMethodOptions = {}): AnyApiMethodDefinition {
  return { ...options }
}

function assertId(id: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(id) || id.includes('/')) {
    throw new Error(`Invalid API id ${JSON.stringify(id)}; use a stable single-segment identifier.`)
  }
}

/** Internal authenticity check shared by the source and generated Host adapters. */
export function isApiHostRegistration(value: unknown): value is ApiHostRegistration {
  return typeof value === 'object' && value !== null && apiHostRegistrations.has(value)
}

/** Internal registration data shared by the author helper and Host runtime. */
export function apiHostRegistrationParts(value: ApiHostRegistration): ApiHostRegistrationParts {
  const parts = apiHostRegistrations.get(value)
  if (parts === undefined) throw new TypeError('Invalid API Host contribution; create it with contract.host({ ...handlers }).')
  return parts
}

export function defineApi<const Methods extends Record<string, AnyApiMethodDefinition>>(definition: {
  readonly id: string
  readonly version: number
  readonly methods: Methods
}): ApiContract<Methods> {
  assertId(definition.id)
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new Error(`API ${JSON.stringify(definition.id)} version must be a positive integer.`)
  }
  const contract: ApiContract<Methods> = {
    ...definition,
    host<const Handlers extends ApiHandlers<Methods>>(
      handlers: Handlers & Record<Exclude<keyof Handlers, keyof Methods>, never>,
      options: ApiHostOptions = {},
    ): ApiHostRegistration<Methods, Handlers> {
      const expected = Object.keys(definition.methods)
      const missing = expected.filter(name => typeof handlers[name] !== 'function')
      const extra = Object.keys(handlers).filter(name => !(name in definition.methods))
      if (missing.length > 0 || extra.length > 0) {
        const details = [
          ...(missing.length === 0 ? [] : [`missing ${missing.map(value => JSON.stringify(value)).join(', ')}`]),
          ...(extra.length === 0 ? [] : [`unexpected ${extra.map(value => JSON.stringify(value)).join(', ')}`]),
        ].join('; ')
        throw new Error(`API ${JSON.stringify(definition.id)} handlers do not exactly match its methods: ${details}.`)
      }
      const registration = {} as ApiHostRegistration<Methods, Handlers>
      apiHostRegistrations.set(registration, {
        contract,
        handlers: handlers as ApiHandlers<Record<string, AnyApiMethodDefinition>>,
        authority: options.authority ?? 'loopback',
      })
      return registration
    },
  }
  return contract
}
