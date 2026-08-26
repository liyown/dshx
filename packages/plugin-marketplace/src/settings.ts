import Schema from '@deepseek-ai/schemastery'
import { defineSettings } from '@becomeopc/dshx/settings'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'

export const DEFAULT_HUB_BASE_URL = 'https://dshx.io'

export interface MarketplaceSettings {
  readonly hubBaseUrl: string
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

export function validateHubBaseUrl(value: string): URL {
  const url = new URL(value)
  if (url.username !== '' || url.password !== '') throw new Error('Framework Hub URL must not contain credentials.')
  if (url.search !== '' || url.hash !== '') throw new Error('Framework Hub URL must not contain a query or fragment.')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) {
    throw new Error('Framework Hub URL must use HTTPS; loopback HTTP is allowed for development.')
  }
  return url
}

export function normalizeHubBaseUrl(value: string): string {
  const url = validateHubBaseUrl(value)
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.href.replace(/\/$/, '')
}

let activeSettings: SettingsScope<MarketplaceSettings> | undefined

export function getMarketplaceSettings(): MarketplaceSettings {
  return activeSettings?.get() ?? { hubBaseUrl: DEFAULT_HUB_BASE_URL }
}

export const marketplaceSettings = defineSettings({
  namespace: 'dshx-plugin-marketplace',
  schema: Schema.object({
    hubBaseUrl: Schema.string().default(DEFAULT_HUB_BASE_URL),
  }),
  applies: 'live',
})

export const marketplaceSettingsHost = marketplaceSettings.host({
  base: { hubBaseUrl: DEFAULT_HUB_BASE_URL },
  validate(value) {
    validateHubBaseUrl(value.hubBaseUrl)
  },
  setup(scope) {
    activeSettings = scope
    return () => {
      if (activeSettings === scope) activeSettings = undefined
    }
  },
})
