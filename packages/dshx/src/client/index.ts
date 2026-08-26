export { defineClient, defineSlot } from './define.js'
export { defineLocale } from './locale.js'
export type {
  ClientConversationContribution,
  ClientDefinition,
  LocaleDefinition,
  LocaleDictionaries,
  LocaleKeyOf,
  PropsLocaleOf,
  SlotContribution,
  SlotOptions,
} from './types.js'
export { useApi, useApiQuery } from '../api/client.js'
export { useSettings } from '../settings/client.js'
export type { SettingsMutationState, SettingsReadError, SettingsState } from '../settings/types.js'
export type { HandleOf } from '@deepseek-ai/dsh-client-ui-slots'
