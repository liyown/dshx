import type { Context } from '@deepseek-ai/cordis'
import type { SettingsApplies, SettingsScope } from '@deepseek-ai/dsh-settings'
import type z from '@deepseek-ai/schemastery'

type WithoutIndexSignature<Value extends object> = {
  [Key in keyof Value as string extends Key ? never : number extends Key ? never : symbol extends Key ? never : Key]: Value[Key]
}

/** Output value produced by an official Schemastery settings schema. */
export type SettingsValue<Schema extends z<any, object>> = WithoutIndexSignature<ReturnType<Schema>>

/** Browser-side decoder for a redacted Settings value. */
export interface SettingsClientOptions<ClientValue> {
  readonly decode: (value: unknown) => ClientValue | undefined
}

/** Host-only registration behavior that must never enter a shared Client contract. */
export interface SettingsHostOptions<Value extends object> {
  readonly base?: Partial<Value>
  readonly validate?: (value: Value) => void
  readonly setup?: (scope: SettingsScope<Value>, ctx: Context) => void | (() => void)
}

/** One complete, portable Settings namespace contract. */
export interface SettingsContract<Schema extends z<any, object> = z<any, Record<string, unknown>>, ClientValue = SettingsValue<Schema>> {
  readonly kind: 'settings'
  readonly namespace: string
  readonly schema: Schema
  readonly applies: SettingsApplies
  readonly client?: SettingsClientOptions<ClientValue>
  readonly host: (options: SettingsHostOptions<SettingsValue<Schema>>) => SettingsHostContribution<Schema, ClientValue>
}

/** A Settings contract paired with optional Host-only registration behavior. */
export interface SettingsHostContribution<Schema extends z<any, object> = z<any, Record<string, unknown>>, ClientValue = SettingsValue<Schema>> {
  readonly kind: 'settings-host'
  readonly contract: SettingsContract<Schema, ClientValue>
  readonly options: SettingsHostOptions<SettingsValue<Schema>>
}

/** One Settings value accepted by defineHost({ settings }). */
export type SettingsContribution = SettingsContract | SettingsHostContribution

/** One schema-declared secret position exposed to a redacted Client. */
export interface SettingsSecretState {
  readonly path: readonly string[]
  readonly set: boolean
}

export type SettingsReadErrorKind = 'provider-unavailable' | 'namespace-unregistered' | 'decode-failed' | 'sync-failed'

/** Read-side Settings problem that does not replace the last accepted value. */
export interface SettingsReadError {
  readonly kind: SettingsReadErrorKind
  readonly message: string
}

/** Mutation state local to one useSettings() call. */
export interface SettingsMutationState {
  readonly pending: boolean
  readonly error: unknown | null
  clearError(): void
}

/** Reactive Client view over one official Settings namespace scope. */
export interface SettingsState<Value extends object, ClientValue> {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly value: ClientValue | undefined
  readonly base: unknown
  readonly user: unknown
  readonly revision: number | undefined
  readonly writable: boolean
  readonly mode: 'host' | 'memory'
  readonly applies: SettingsApplies | undefined
  readonly secrets: readonly SettingsSecretState[]
  readonly error: SettingsReadError | null
  readonly mutation: SettingsMutationState
  set<Key extends keyof Value & string>(field: Key, value: Value[Key]): Promise<void>
  unset<Key extends keyof Value & string>(field: Key): Promise<void>
}
