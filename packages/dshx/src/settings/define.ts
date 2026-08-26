import type z from '@deepseek-ai/schemastery'
import type { SettingsClientOptions, SettingsContract, SettingsContribution, SettingsHostContribution, SettingsHostOptions, SettingsValue } from './types.js'

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/
const settingsContracts = new WeakSet<object>()
export interface SettingsHostContributionParts {
  readonly contract: SettingsContract<z<any, object>, any>
  readonly options: SettingsHostOptions<any>
}

const settingsHostContributions = new WeakMap<object, SettingsHostContributionParts>()

interface SchemaNode {
  readonly type?: unknown
  readonly meta?: { readonly role?: unknown }
  readonly [key: string]: unknown
}
interface SchemaJson {
  readonly uid?: unknown
  readonly refs?: Record<string, SchemaNode>
}
const SAFE_SECRET_CONTAINERS = new Set(['object', 'dict', 'array'])

function secretAnalysis(schema: z<any, object>): { readonly contains: boolean; readonly unsafe: boolean } {
  const json = schema.toJSON() as unknown as SchemaJson
  const refs = json.refs
  if (refs === undefined || (typeof json.uid !== 'string' && typeof json.uid !== 'number')) return { contains: false, unsafe: false }
  const memo = new Map<string, { readonly contains: boolean; readonly unsafe: boolean }>()
  const active = new Set<string>()
  const visit = (id: string): { readonly contains: boolean; readonly unsafe: boolean } => {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    if (active.has(id)) return { contains: false, unsafe: false }
    active.add(id)
    const node = refs[id]
    if (node === undefined) return { contains: false, unsafe: false }
    const direct = node.meta?.role === 'secret'
    const links: string[] = []
    for (const [key, value] of Object.entries(node)) {
      if (key === 'uid' || key === 'meta' || key === 'callback' || key === 'type') continue
      if ((typeof value === 'string' || typeof value === 'number') && refs[String(value)] !== undefined) links.push(String(value))
      else if (Array.isArray(value)) {
        for (const item of value) if ((typeof item === 'string' || typeof item === 'number') && refs[String(item)] !== undefined) links.push(String(item))
      } else if (typeof value === 'object' && value !== null) {
        for (const item of Object.values(value))
          if ((typeof item === 'string' || typeof item === 'number') && refs[String(item)] !== undefined) links.push(String(item))
      }
    }
    const children = links.map(visit)
    const contains = direct || children.some(child => child.contains)
    const unsafe =
      children.some(child => child.unsafe) ||
      (children.some(child => child.contains) && !SAFE_SECRET_CONTAINERS.has(String(node.type))) ||
      (direct && links.length > 0 && !SAFE_SECRET_CONTAINERS.has(String(node.type)))
    const result = { contains, unsafe }
    memo.set(id, result)
    active.delete(id)
    return result
  }
  return visit(String(json.uid))
}

export function settingsSchemaContainsSecret(schema: z<any, object>): boolean {
  try {
    return secretAnalysis(schema).contains
  } catch {
    return false
  }
}

export function settingsSchemaHasUnsafeSecretPath(schema: z<any, object>): boolean {
  try {
    return secretAnalysis(schema).unsafe
  } catch {
    return true
  }
}

export interface SettingsDefinition<Schema extends z<any, object>, ClientValue extends object = SettingsValue<Schema>> {
  readonly namespace: string
  readonly schema: Schema
  readonly applies?: 'live' | 'restart'
  readonly client?: SettingsClientOptions<ClientValue>
}

export function isSettingsContract(value: unknown): value is SettingsContract {
  return typeof value === 'object' && value !== null && settingsContracts.has(value)
}

export function isSettingsHostContribution(value: unknown): value is SettingsHostContribution {
  return typeof value === 'object' && value !== null && settingsHostContributions.has(value)
}

export function settingsHostContributionParts(value: SettingsHostContribution): SettingsHostContributionParts {
  const parts = settingsHostContributions.get(value)
  if (parts === undefined) throw new TypeError('Invalid Settings Host contribution; create it with contract.host({ ...options }).')
  return parts
}

export function settingsContributionContract(value: SettingsContribution): SettingsContract<z<any, object>, any> {
  return isSettingsContract(value) ? value : settingsHostContributionParts(value).contract
}

export function defineSettings<const Schema extends z<any, object>>(
  definition: Omit<SettingsDefinition<Schema, SettingsValue<Schema>>, 'client'> & { readonly client?: undefined },
): SettingsContract<Schema, SettingsValue<Schema>>
export function defineSettings<const Schema extends z<any, object>, const Decoder extends (value: unknown) => object>(
  definition: Omit<SettingsDefinition<Schema, ReturnType<Decoder>>, 'client'> & {
    readonly client: { readonly decode: Decoder & ((value: unknown) => Exclude<ReturnType<Decoder>, undefined>) }
  },
): SettingsContract<Schema, ReturnType<Decoder>>
export function defineSettings<const Schema extends z<any, object>>(definition: any): SettingsContract<Schema, any> {
  if (!NAMESPACE_PATTERN.test(definition.namespace)) {
    throw new TypeError(`Settings namespace ${JSON.stringify(definition.namespace)} must match ${String(NAMESPACE_PATTERN)}.`)
  }
  if (typeof definition.schema !== 'function' || typeof definition.schema.toJSON !== 'function') {
    throw new TypeError(`Settings ${JSON.stringify(definition.namespace)} schema must be an official Schemastery schema.`)
  }
  if (definition.client !== undefined && typeof definition.client.decode !== 'function') {
    throw new TypeError(`Settings ${JSON.stringify(definition.namespace)} client.decode must be a function.`)
  }
  const contract: SettingsContract<Schema, any> = {
    namespace: definition.namespace,
    schema: definition.schema,
    applies: definition.applies ?? 'live',
    ...(definition.client === undefined
      ? {}
      : {
          client: {
            decode(value: unknown): any {
              const decoded = definition.client!.decode(value)
              if (decoded === undefined) throw new TypeError(`Settings ${JSON.stringify(definition.namespace)} client.decode returned undefined.`)
              return decoded
            },
          },
        }),
    host(options: SettingsHostOptions<SettingsValue<Schema>>): SettingsHostContribution<Schema, any> {
      const contribution = {} as SettingsHostContribution<Schema, any>
      settingsHostContributions.set(contribution, {
        contract,
        options,
      })
      return contribution
    },
  } as SettingsContract<Schema, any>
  settingsContracts.add(contract)
  return contract
}
