import type { Context } from '@deepseek-ai/cordis'

/** Minimal Standard Schema-compatible validator shape. */
export interface ApiSchema<T> {
  readonly '~standard': {
    readonly validate: (value: unknown) => unknown | Promise<unknown>
  }
  readonly __type?: T
}

export interface ApiMethodOptions<I, O> {
  readonly input?: ApiSchema<I>
  readonly output?: ApiSchema<O>
}

export interface ApiMethodDefinition<I = void, O = unknown> {
  readonly input?: ApiSchema<I>
  readonly output?: ApiSchema<O>
  readonly __input?: I
  readonly __output?: O
}

export interface ApiContract<
  Methods extends Record<string, ApiMethodDefinition<any, any>> = Record<string, ApiMethodDefinition<any, any>>,
> {
  readonly id: string
  readonly version: number
  readonly methods: Methods
  readonly host: <Handlers extends ApiHandlers<Methods>>(
    handlers: Handlers,
    options?: ApiHostOptions,
  ) => ApiHostRegistration<Methods, Handlers>
}

export type ApiInput<M> = M extends ApiMethodDefinition<infer I, any> ? I : never
export type ApiOutput<M> = M extends ApiMethodDefinition<any, infer O> ? O : never

export type ApiHandlerContext<I> = {
  readonly input: I
  readonly ctx: Context
  readonly signal: AbortSignal
}

export type ApiHandler<I, O> = (context: ApiHandlerContext<I>) => O | Promise<O>

export type ApiHandlers<Methods extends Record<string, ApiMethodDefinition<any, any>>> = {
  readonly [K in keyof Methods]: ApiHandler<ApiInput<Methods[K]>, ApiOutput<Methods[K]>>
}

export type ApiHostOptions = {
  readonly authority?: 'loopback' | 'trusted-host'
}

export interface ApiHostRegistration<
  Methods extends Record<string, ApiMethodDefinition<any, any>> = Record<string, ApiMethodDefinition<any, any>>,
  Handlers extends ApiHandlers<Methods> = ApiHandlers<Methods>,
> {
  readonly kind: 'api'
  readonly contract: ApiContract<Methods>
  readonly handlers: Handlers
  readonly authority: 'loopback' | 'trusted-host'
}

export type ApiRegistration = ApiHostRegistration

export type ApiCallOptions = {
  readonly signal?: AbortSignal
}

export type ApiMethodClient<M> = ApiInput<M> extends void
  ? (input?: undefined, options?: ApiCallOptions) => Promise<ApiOutput<M>>
  : (input: ApiInput<M>, options?: ApiCallOptions) => Promise<ApiOutput<M>>

export type ApiSafeMethodClient<M> = ApiInput<M> extends void
  ? (input?: undefined, options?: ApiCallOptions) => Promise<ApiCallResult<ApiOutput<M>>>
  : (input: ApiInput<M>, options?: ApiCallOptions) => Promise<ApiCallResult<ApiOutput<M>>>

export type ApiClient<Methods extends Record<string, ApiMethodDefinition<any, any>> = Record<string, ApiMethodDefinition<any, any>>> = {
  readonly [K in keyof Methods]: ApiMethodClient<Methods[K]>
} & {
  readonly safe: {
    readonly [K in keyof Methods]: ApiSafeMethodClient<Methods[K]>
  }
}

export type ApiCallResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApiError }

export type ApiErrorKind = 'transport' | 'remote' | 'contract' | 'aborted' | 'unavailable'

export class ApiError extends Error {
  override readonly name = 'ApiError'

  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly apiId: string,
    readonly method: string,
    readonly retryable: boolean,
    readonly remoteCode?: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message, options)
  }
}

export interface ApiQueryState<T> {
  readonly loading: boolean
  readonly data?: T
  readonly error?: ApiError
  readonly retry: () => void
}
