import { defineApi, method } from '@becomeopc/dshx/api'
import { z } from 'zod'

export const marketplaceLocaleSchema = z.enum(['en', 'zh'])
export const marketplaceBadgeSchema = z.enum(['official', 'verified', 'community'])
export const marketplaceCompatibilitySchema = z.enum(['compatible', 'incompatible', 'unknown'])

export const marketplaceCategorySchema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().min(1).max(100),
})

export const marketplaceCardSchema = z.object({
  slug: z.string().min(1).max(160),
  name: z.string().min(1).max(160),
  packageName: z.string().min(1).max(240),
  description: z.string().max(600),
  version: z.string().min(1).max(100),
  compatibilityRange: z.string().min(1).max(160),
  compatibility: marketplaceCompatibilitySchema,
  category: z.string().min(1).max(80),
  badge: marketplaceBadgeSchema,
  glyph: z.string().min(1).max(4),
  iconUrl: z.string().url().nullable(),
  installed: z.boolean(),
})

export const marketplaceListInputSchema = z.object({
  locale: marketplaceLocaleSchema,
  category: z.string().min(1).max(80).optional(),
  cursor: z.string().min(1).max(1000).optional(),
})

export const marketplaceListOutputSchema = z.object({
  categories: z.array(marketplaceCategorySchema).max(100),
  items: z.array(marketplaceCardSchema).max(24),
  nextCursor: z.string().max(1000).nullable(),
})

export const installFailureCodeSchema = z.enum([
  'busy',
  'catalog-unavailable',
  'target-unavailable',
  'profile-unavailable',
  'compatibility-unknown',
  'incompatible',
  'install-failed',
  'activation-missing',
  'cancelled',
  'timeout',
])

const installSuccessSchema = z.object({
  status: z.enum(['installed', 'already-installed']),
  packageName: z.string().min(1).max(240),
  version: z.string().min(1).max(100),
  restartRequired: z.literal(true),
})

const installFailureSchema = z.object({
  status: z.literal('failed'),
  code: installFailureCodeSchema,
  retryable: z.boolean(),
})

export const marketplaceInstallOutputSchema = z.union([installSuccessSchema, installFailureSchema])

export type MarketplaceLocale = z.infer<typeof marketplaceLocaleSchema>
export type MarketplaceBadge = z.infer<typeof marketplaceBadgeSchema>
export type MarketplaceCategory = z.infer<typeof marketplaceCategorySchema>
export type MarketplaceCard = z.infer<typeof marketplaceCardSchema>
export type MarketplaceListInput = z.infer<typeof marketplaceListInputSchema>
export type MarketplaceListOutput = z.infer<typeof marketplaceListOutputSchema>
export type MarketplaceInstallOutput = z.infer<typeof marketplaceInstallOutputSchema>
export type InstallFailureCode = z.infer<typeof installFailureCodeSchema>

export const pluginMarketplaceApi = defineApi({
  id: 'plugin-marketplace',
  version: 1,
  methods: {
    list: method({
      input: marketplaceListInputSchema,
      output: marketplaceListOutputSchema,
    }),
    install: method({
      input: z.object({
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .max(160),
      }),
      output: marketplaceInstallOutputSchema,
    }),
  },
})
