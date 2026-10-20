import Schema from '@deepseek-ai/schemastery'
import { defineSettings } from '@becomeopc/dshx/settings'

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

const DEFAULT_SETTINGS: MarketplaceSettings = { hubBaseUrl: DEFAULT_HUB_BASE_URL }
let activeSettings: MarketplaceSettings | undefined

export function getMarketplaceSettings(): MarketplaceSettings {
  return activeSettings ?? DEFAULT_SETTINGS
}

/** Activate the Config DSH resolved for this plugin entry; returns a disposer. */
export function applyMarketplaceSettings(value: MarketplaceSettings | undefined): () => void {
  const settings = value ?? DEFAULT_SETTINGS
  validateHubBaseUrl(settings.hubBaseUrl)
  activeSettings = settings
  return () => {
    if (activeSettings === settings) activeSettings = undefined
  }
}

export const marketplaceSettings = defineSettings({
  schema: Schema.object({
    hubBaseUrl: Schema.string().default(DEFAULT_HUB_BASE_URL),
  }),
})
