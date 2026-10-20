import type z from '@deepseek-ai/schemastery'

declare const settingsContractBrand: unique symbol

type WithoutIndexSignature<Value extends object> = {
  [Key in keyof Value as string extends Key ? never : number extends Key ? never : symbol extends Key ? never : Key]: Value[Key]
}

/**
 * Value DSH hands the Host at load time. `defineSettings()` marks the root
 * schema volatile, so this is a stable reference updated in place by live
 * Settings edits; read it with `config.get()`.
 */
export type SettingsValue<Schema extends z<any, object>> = WithoutIndexSignature<ReturnType<Schema>>

type VolatileLike<Value> = { readonly get: () => Value }

/** Strip DSH volatile references from the plain value served to the Client. */
type UnwrapVolatile<Value> =
  Value extends VolatileLike<infer Inner>
    ? UnwrapVolatile<Inner>
    : Value extends readonly (infer Item)[]
      ? readonly UnwrapVolatile<Item>[]
      : Value extends object
        ? { [Key in keyof Value]: UnwrapVolatile<Value[Key]> }
        : Value

/** Plain Config value DSH serializes to the Client Config form. */
export type SettingsFormValue<Schema extends z<any, object>> = WithoutIndexSignature<UnwrapVolatile<ReturnType<Schema>> & object>

/**
 * One plugin Config schema projected by DSH into a Settings form.
 *
 * DSH 0.2 identifies the form by the profile entry that loads the plugin, so a
 * contract carries no namespace of its own: the same plugin entry owns the
 * schema on the Host and the form on the Client.
 */
export interface SettingsContract<Schema extends z<any, object> = z<any, Record<string, unknown>>> {
  readonly [settingsContractBrand]: true
  readonly schema: Schema
}

/** One field edit addressed from the section root. */
export type SettingsPathOp =
  { readonly op: 'set'; readonly path: readonly string[]; readonly value: unknown } | { readonly op: 'unset'; readonly path: readonly string[] }

export interface SettingsSecretState {
  readonly path: readonly string[]
  readonly set: boolean
}

export type SettingsReadErrorKind = 'provider-unavailable' | 'entry-unresolved' | 'decode-failed' | 'sync-failed'

export interface SettingsReadError {
  readonly kind: SettingsReadErrorKind
  readonly message: string
}

export interface SettingsMutationState {
  readonly pending: boolean
}

/** Live state of one plugin's Config form. */
export interface SettingsState<Value extends object> {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly value: Value | undefined
  /** Composition layer the Host resolved {@link value} over. */
  readonly base: unknown
  /** Raw user layer as stored; a field's presence marks it overridden. */
  readonly user: unknown
  readonly revision: number | undefined
  readonly writable: boolean
  /** Schema-declared secret positions the wire removed from {@link value}. */
  readonly secrets: readonly SettingsSecretState[]
  readonly error: SettingsReadError | null
  readonly mutation: SettingsMutationState
  /** Write one field; resolves to whether the Host accepted the write. */
  set<Key extends keyof Value & string>(field: Key, value: Value[Key]): Promise<boolean>
  /** Clear one field so it re-inherits the composition layer. */
  unset<Key extends keyof Value & string>(field: Key): Promise<boolean>
  /** Apply ordered edits as one revision-fenced write. */
  mutate(ops: readonly SettingsPathOp[], expectedRevision?: number): Promise<boolean>
}
