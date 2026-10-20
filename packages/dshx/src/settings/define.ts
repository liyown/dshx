import type z from '@deepseek-ai/schemastery'
import type { SettingsContract } from './types.js'

const settingsContracts = new WeakSet<object>()

export interface SettingsDefinition<Schema extends z<any, object>> {
  /** The plugin Config schema DSH projects into a Settings form. */
  readonly schema: Schema
}

/** The same schema shape DSH receives after DSHX makes the root live. */
export type VolatileSchema<Schema extends z<any, object>> = ReturnType<Schema['volatile']>

function findVolatile(schema: unknown, path: string): string | undefined {
  if (typeof schema !== 'function') return undefined
  const node = schema as { meta?: { volatile?: boolean }; dict?: Record<string, unknown>; inner?: unknown; list?: readonly unknown[] }
  if (node.meta?.volatile === true) return path
  for (const [key, child] of Object.entries(node.dict ?? {})) {
    const found = findVolatile(child, `${path}.${key}`)
    if (found !== undefined) return found
  }
  const inner = findVolatile(node.inner, `${path}[]`)
  if (inner !== undefined) return inner
  for (const [index, child] of (node.list ?? []).entries()) {
    const found = findVolatile(child, `${path}[${String(index)}]`)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Declare the plugin Config schema shared by the Host entry and Client form.
 *
 * DSH only projects volatile Config fields into its Settings form. DSHX marks
 * the root schema volatile so every declared field is live and the Host
 * receives one stable reference updated in place; read it with `config.get()`.
 */
export function defineSettings<const Schema extends z<any, object>>(definition: SettingsDefinition<Schema>): SettingsContract<VolatileSchema<Schema>> {
  if (typeof definition.schema !== 'function' || typeof definition.schema.toJSON !== 'function') {
    throw new TypeError('defineSettings() schema must be an official Schemastery schema.')
  }
  const volatile = findVolatile(definition.schema, 'config')
  if (volatile !== undefined && volatile !== 'config') {
    throw new TypeError(`defineSettings() marks the root Config schema volatile; remove the field-level .volatile() at ${volatile}.`)
  }
  const schema = (volatile === 'config' ? definition.schema : definition.schema.volatile()) as VolatileSchema<Schema>
  const contract = { schema } as SettingsContract<VolatileSchema<Schema>>
  settingsContracts.add(contract)
  return contract
}

export function isSettingsContract(value: unknown): value is SettingsContract {
  return typeof value === 'object' && value !== null && settingsContracts.has(value)
}
