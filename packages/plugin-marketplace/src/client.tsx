import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { defineClient, defineSlot } from '@becomeopc/dshx/client'
import { MarketplaceTab } from './MarketplaceTab.js'
import { marketplaceLocale, MARKETPLACE_LOCALE_NAMESPACE } from './locales.js'

let tabLabel = (): string => 'Plugin marketplace'

const marketplaceTab = defineSlot('settings.plugins.tab', {
  id: 'marketplace',
  order: 20,
  label: () => tabLabel(),
  locale: marketplaceLocale,
  component: MarketplaceTab,
})

export default defineClient({
  name: '@becomeopc/dshx-plugin-marketplace',
  locales: [marketplaceLocale],
  slots: [marketplaceTab],
  setup(ctx) {
    const t = ctx.locale.bind(MARKETPLACE_LOCALE_NAMESPACE)
    tabLabel = () => t('tab')
  },
})
