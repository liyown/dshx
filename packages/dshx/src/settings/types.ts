import type { Context } from '@deepseek-ai/cordis'
import type { SettingsApplies, SettingsScope } from '@deepseek-ai/dsh-settings'
import type z from '@deepseek-ai/schemastery'

declare const settingsContractBrand: unique symbol
declare const settingsHostContributionBrand: unique symbol

type WithoutIndexSignature<Value extends object> = {
  [Key in keyof Value as string extends Key ? never : number extends Key ? never : symbol extends Key ? never : Key]: Value[Key]
}

export type SettingsValue<Schema extends z<any, object>> = WithoutIndexSignature<ReturnType<Schema>>

export interface SettingsClientOptions<ClientValue extends object> {
  /** Decode a redacted value or throw. Undefined is not a failure sentinel. */
  readonly decode: (value: unknown) => ClientValue
}

export interface SettingsHostOptions<Value extends object> {
  readonly base?: Partial<Value>
  readonly validate?: (value: Value) => void
  readonly setup?: (scope: SettingsScope<Value>, ctx: Context) => void | (() => void)
}

export interface SettingsContract<Schema extends z<any, object> = z<any, Record<string, unknown>>, ClientValue extends object = SettingsValue<Schema>> {
  readonly [settingsContractBrand]: true
  readonly namespace: string
  readonly schema: Schema
  readonly applies: SettingsApplies
  readonly client?: SettingsClientOptions<ClientValue>
  readonly host: (options: SettingsHostOptions<SettingsValue<Schema>>) => SettingsHostContribution<Schema, ClientValue>
}

export interface SettingsHostContribution<Schema extends z<any, object> = z<any, Record<string, unknown>>, ClientValue extends object = SettingsValue<Schema>> {
  readonly [settingsHostContributionBrand]: {
    readonly schema: Schema
    readonly clientValue: ClientValue
  }
}

export type SettingsContribution = SettingsContract | SettingsHostContribution

export interface SettingsSecretState {
  readonly path: readonly string[]
  readonly set: boolean
}
export type SettingsReadErrorKind = 'provider-unavailable' | 'namespace-unregistered' | 'decode-failed' | 'sync-failed'
export interface SettingsReadError {
  readonly kind: SettingsReadErrorKind
  readonly message: string
}
export interface SettingsMutationState {
  readonly pending: boolean
}

export interface SettingsState<Value extends object, ClientValue extends object> {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly value: ClientValue | undefined
  readonly revision: number | undefined
  readonly writable: boolean
  readonly mode: 'host' | 'memory'
  readonly applies: SettingsApplies
  readonly secrets: readonly SettingsSecretState[]
  readonly error: SettingsReadError | null
  readonly mutation: SettingsMutationState
  set<Key extends keyof Value & string>(field: Key, value: Value[Key]): Promise<void>
  unset<Key extends keyof Value & string>(field: Key): Promise<void>
}
