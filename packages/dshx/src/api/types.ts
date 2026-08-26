import type { Context } from '@deepseek-ai/cordis'
import type { StandardSchemaV1 } from '@standard-schema/spec'

declare const apiHostRegistrationBrand: unique symbol
declare const apiErrorBrand: unique symbol
declare const apiClientInputBrand: unique symbol
declare const apiHostInputBrand: unique symbol
declare const apiHostOutputBrand: unique symbol
declare const apiClientOutputBrand: unique symbol

export type ApiSchema<Input = unknown, Output = Input> = StandardSchemaV1<Input, Output>

export interface ApiMethodOptions<InputSchema extends ApiSchema = ApiSchema, OutputSchema extends ApiSchema = ApiSchema> {
  readonly input?: InputSchema
  readonly output?: OutputSchema
}

/** Client input -> Host input -> Host output -> Client output. */
export interface ApiMethodDefinition<ClientInput = void, HostInput = ClientInput, HostOutput = unknown, ClientOutput = HostOutput> {
  readonly input?: ApiSchema<ClientInput, HostInput>
  readonly output?: ApiSchema<HostOutput, ClientOutput>
  readonly [apiClientInputBrand]?: ClientInput
  readonly [apiHostInputBrand]?: HostInput
  readonly [apiHostOutputBrand]?: HostOutput
  readonly [apiClientOutputBrand]?: ClientOutput
}

export type AnyApiMethodDefinition = ApiMethodDefinition<any, any, any, any>

export interface ApiContract<Methods extends Record<string, AnyApiMethodDefinition> = Record<string, AnyApiMethodDefinition>> {
  readonly id: string
  readonly version: number
  readonly methods: Methods
  readonly host: <const Handlers extends ApiHandlers<Methods>>(
    handlers: Handlers & Record<Exclude<keyof Handlers, keyof Methods>, never>,
    options?: ApiHostOptions,
  ) => ApiHostRegistration<Methods, Handlers>
}

export type ApiClientInput<M> = M extends ApiMethodDefinition<infer Input, any, any, any> ? Input : never
export type ApiHostInput<M> = M extends ApiMethodDefinition<any, infer Input, any, any> ? Input : never
export type ApiHostOutput<M> = M extends ApiMethodDefinition<any, any, infer Output, any> ? Output : never
export type ApiClientOutput<M> = M extends ApiMethodDefinition<any, any, any, infer Output> ? Output : never
export type ApiInput<M> = ApiClientInput<M>
export type ApiOutput<M> = ApiClientOutput<M>

export type ApiHandlerContext<I> = {
  readonly input: I
  readonly ctx: Context
  readonly signal: AbortSignal
}

export type ApiHandler<I, O> = (context: ApiHandlerContext<I>) => O | Promise<O>

export type ApiHandlers<Methods extends Record<string, AnyApiMethodDefinition>> = {
  readonly [K in keyof Methods]: ApiHandler<ApiHostInput<Methods[K]>, ApiHostOutput<Methods[K]>>
}

export type ApiHostOptions = {
  readonly authority?: 'loopback' | 'trusted-host'
}

export interface ApiHostRegistration<
  Methods extends Record<string, AnyApiMethodDefinition> = Record<string, AnyApiMethodDefinition>,
  Handlers extends ApiHandlers<Methods> = ApiHandlers<Methods>,
> {
  readonly [apiHostRegistrationBrand]: {
    readonly methods: Methods
    readonly handlers: Handlers
  }
}

export type ApiRegistration = ApiHostRegistration

export type ApiCallOptions = {
  readonly signal?: AbortSignal
}

export type ApiMethodClient<M> =
  ApiClientInput<M> extends void
    ? (input?: undefined, options?: ApiCallOptions) => Promise<ApiClientOutput<M>>
    : (input: ApiClientInput<M>, options?: ApiCallOptions) => Promise<ApiClientOutput<M>>

export type ApiSafeMethodClient<M> =
  ApiClientInput<M> extends void
    ? (input?: undefined, options?: ApiCallOptions) => Promise<ApiCallResult<ApiClientOutput<M>>>
    : (input: ApiClientInput<M>, options?: ApiCallOptions) => Promise<ApiCallResult<ApiClientOutput<M>>>

export type ApiClient<Methods extends Record<string, AnyApiMethodDefinition> = Record<string, AnyApiMethodDefinition>> = {
  readonly [K in keyof Methods]: ApiMethodClient<Methods[K]>
} & {
  readonly safe: { readonly [K in keyof Methods]: ApiSafeMethodClient<Methods[K]> }
}

export type ApiCallResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError }
export type ApiErrorKind = 'transport' | 'remote' | 'contract' | 'aborted' | 'unavailable'

/** Read-only, opaque API failure. */
export interface ApiError extends Error {
  readonly [apiErrorBrand]: true
  readonly name: 'ApiError'
  readonly kind: ApiErrorKind
  readonly apiId: string
  readonly method: string
  readonly retryable: boolean
  readonly remoteCode?: string
}

export type ApiFetchStatus = 'idle' | 'fetching' | 'paused'
export type ApiQueryResult<T> =
  | { readonly status: 'pending'; readonly fetchStatus: ApiFetchStatus; readonly data: undefined; readonly error: null; readonly refetch: () => void }
  | { readonly status: 'success'; readonly fetchStatus: ApiFetchStatus; readonly data: T; readonly error: null; readonly refetch: () => void }
  | { readonly status: 'error'; readonly fetchStatus: 'idle'; readonly data: T | undefined; readonly error: ApiError; readonly refetch: () => void }

export type ApiQueryState<T> = ApiQueryResult<T>
export type ApiQueryBaseOptions = { readonly enabled?: boolean; readonly signal?: AbortSignal }
export type ApiQueryOptions<M> = ApiClientInput<M> extends void ? ApiQueryBaseOptions : ApiQueryBaseOptions & { readonly input: ApiClientInput<M> }
