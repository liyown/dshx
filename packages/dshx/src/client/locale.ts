import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type { LocaleDefinition, LocaleDictionaries } from './types.js'

export interface LocaleDefinitionParts {
  readonly namespace: string
  readonly dictionaries: LocaleDictionaries
}

const localeDefinitions = new WeakMap<object, LocaleDefinitionParts>()

type DictionaryKeys<Dictionaries extends LocaleDictionaries> = {
  [Id in LocaleId]: keyof Dictionaries[Id]
}[LocaleId] &
  string

type BalancedDictionaries<Dictionaries extends LocaleDictionaries> = Dictionaries &
  Record<Exclude<keyof Dictionaries, LocaleId>, never> & {
    readonly [Id in LocaleId]: Dictionaries[Id] & Record<Exclude<DictionaryKeys<Dictionaries>, keyof Dictionaries[Id]>, never>
  }

/** Define one type-safe namespace without requiring LocaleNamespaceMap declaration merging. */
export function defineLocale<const Namespace extends string, const Dictionaries extends LocaleDictionaries>(
  namespace: Namespace,
  dictionaries: BalancedDictionaries<Dictionaries>,
): LocaleDefinition<Namespace, DictionaryKeys<Dictionaries>> {
  const definition = {} as LocaleDefinition<Namespace, DictionaryKeys<Dictionaries>>
  localeDefinitions.set(definition, { namespace, dictionaries })
  return definition
}

export function isLocaleDefinition(value: unknown): value is LocaleDefinition {
  return typeof value === 'object' && value !== null && localeDefinitions.has(value)
}

export function localeDefinitionParts(value: LocaleDefinition): LocaleDefinitionParts {
  const parts = localeDefinitions.get(value)
  if (parts === undefined) throw new TypeError('Invalid Locale contribution; create it with defineLocale(namespace, dictionaries).')
  return parts
}
