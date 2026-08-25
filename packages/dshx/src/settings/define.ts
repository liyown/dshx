import type z from '@deepseek-ai/schemastery'
import type { SettingsClientOptions, SettingsContract, SettingsHostContribution, SettingsHostOptions, SettingsValue } from './types.js'

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/

function containsSecret(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value !== 'object' || value === null) return false
  if (seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) return value.some(item => containsSecret(item, seen))
  const node = value as { readonly meta?: { readonly role?: unknown } }
  if (node.meta?.role === 'secret') return true
  return Object.values(value).some(item => containsSecret(item, seen))
}

/** Internal registration diagnostic shared by source and compiled Host adapters. */
export function settingsSchemaContainsSecret(schema: z<any, object>): boolean {
  try {
    return containsSecret(schema.toJSON())
  } catch {
    // The official Settings registration remains the schema authority. If a
    // custom schema cannot serialize yet, let registration report that error.
    return false
  }
}

export interface SettingsDefinition<Schema extends z<any, object>, ClientValue = SettingsValue<Schema>> {
  readonly namespace: string
  readonly schema: Schema
  readonly applies?: 'live' | 'restart'
  readonly client?: SettingsClientOptions<ClientValue>
}

/** Define one portable Settings contract shared by its Host owner and Client hooks. */
export function defineSettings<const Schema extends z<any, object>, ClientValue = SettingsValue<Schema>>(
  definition: SettingsDefinition<Schema, ClientValue>,
): SettingsContract<Schema, ClientValue> {
  if (!NAMESPACE_PATTERN.test(definition.namespace)) {
    throw new TypeError(`Settings namespace ${JSON.stringify(definition.namespace)} must match ${String(NAMESPACE_PATTERN)}.`)
  }
  if (typeof definition.schema !== 'function' || typeof definition.schema.toJSON !== 'function') {
    throw new TypeError(`Settings ${JSON.stringify(definition.namespace)} schema must be an official Schemastery schema.`)
  }
  if (definition.client !== undefined && typeof definition.client.decode !== 'function') {
    throw new TypeError(`Settings ${JSON.stringify(definition.namespace)} client.decode must be a function.`)
  }
  const contract: SettingsContract<Schema, ClientValue> = {
    kind: 'settings',
    namespace: definition.namespace,
    schema: definition.schema,
    applies: definition.applies ?? 'live',
    ...(definition.client === undefined ? {} : { client: definition.client }),
    host(options: SettingsHostOptions<SettingsValue<Schema>>): SettingsHostContribution<Schema, ClientValue> {
      return { kind: 'settings-host', contract: this, options }
    },
  }
  return contract
}
