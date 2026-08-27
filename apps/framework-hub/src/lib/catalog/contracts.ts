import { validRange } from "semver";
import { z } from "zod";

export const localeSchema = z.enum(["en", "zh"]);

const boundedUrl = z.string().url().max(2_048);
const compatibilityRangeSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => validRange(value, { includePrerelease: true }) !== null, {
    message: "compatibilityRange must be a valid semver range",
  });

export const catalogSortValues = [
  "featured",
  "trending",
  "updated",
  "new",
  "stars",
  "downloads",
] as const;

export const pluginListQuerySchema = z.object({
  locale: localeSchema.default("en"),
  q: z.string().trim().max(80).default(""),
  category: z.string().max(64).nullable().optional(),
  sort: z.enum(catalogSortValues).default("featured"),
  cursor: z.string().max(500).nullable().optional(),
  limit: z.number().int().min(1).max(50).default(24),
});

export const marketplaceSortValues = ["stars", "downloads", "latest"] as const;

/** Public installable-marketplace query. Discovery keeps its broader legacy sort contract. */
export const marketplaceListQuerySchema = pluginListQuerySchema.extend({
  sort: z.enum(marketplaceSortValues).default("latest"),
});

const marketplaceCardResponseSchema = z
  .object({
    slug: z.string().min(1).max(160),
    name: z.string().min(1).max(160),
    scope: z.string().min(1).max(240),
    description: z.string().max(1_000),
    version: z.string().min(1).max(100),
    compat: compatibilityRangeSchema,
    category: z.string().min(1).max(80),
    badge: z.enum(["official", "community"]),
    glyph: z.string().min(1).max(4),
    iconUrl: z.string().nullable(),
  })
  .passthrough();

/** Standard Schema boundary for the public installable-marketplace page. */
export const marketplaceListResponseSchema = z.object({
  items: z.array(marketplaceCardResponseSchema).max(50),
  nextCursor: z.string().max(500).nullable(),
  categories: z
    .array(
      z.object({
        slug: z.string().min(1).max(80),
        name: z.string().min(1).max(100),
      }),
    )
    .max(100),
});

/** Standard Schema boundary for the Host-owned exact install target lookup. */
export const marketplaceDetailResponseSchema = z
  .object({
    plugin: marketplaceCardResponseSchema,
    repositoryUrl: boundedUrl,
    installTargets: z
      .array(
        z.object({
          kind: z.enum(["npm", "github"]),
          spec: z.string().min(1).max(1_000),
          package_name: z.string().min(1).max(240),
          version: z.string().min(1).max(100),
          integrity: z.string().nullable(),
          is_primary: z.union([z.literal(0), z.literal(1), z.boolean()]),
          status: z.enum(["active", "unavailable"]),
        }),
      )
      .max(20),
    releases: z
      .array(
        z
          .object({
            version: z.string().min(1).max(100),
            channel: z.enum(["stable", "prerelease"]),
            git_tag: z.string().min(1).max(255).nullable(),
          })
          .passthrough(),
      )
      .max(20),
  })
  .passthrough();

export const reviewUpsertSchema = z.object({
  rating: z.number().int().min(1).max(5),
  locale: localeSchema,
  body: z.string().trim().max(4_000).nullable().optional(),
  turnstileToken: z.string().min(1).max(2_048),
  idempotencyKey: z.string().min(8).max(200),
});

export const replyCreateSchema = z.object({
  locale: localeSchema,
  body: z.string().trim().min(1).max(2_000),
  turnstileToken: z.string().min(1).max(2_048),
  idempotencyKey: z.string().min(8).max(200),
});

export const communityDeleteSchema = z.object({
  turnstileToken: z.string().min(1).max(2_048),
  idempotencyKey: z.string().min(8).max(200),
});

export const reportCreateSchema = z.object({
  targetType: z.enum(["plugin", "review", "reply", "profile", "collection"]),
  targetId: z.string().uuid(),
  reason: z.enum(["spam", "abuse", "misinformation", "other"]),
  details: z.string().trim().max(1_000).nullable().optional(),
  turnstileToken: z.string().min(1).max(2_048),
  idempotencyKey: z.string().min(8).max(200),
});

export const claimCreateSchema = z.object({
  turnstileToken: z.string().min(1).max(2_048),
  idempotencyKey: z.string().min(8).max(200),
});

export const claimVerifySchema = z.object({
  challengeToken: z.string().min(24).max(512),
});

export const moderationActionSchema = z
  .object({
    action: z.enum(["hide", "restore", "dismiss", "restrict", "unrestrict", "ban", "unban"]),
    targetType: z.enum(["plugin", "review", "reply", "profile", "collection", "user"]),
    targetId: z.string().min(1).max(128),
    reason: z.string().trim().min(3).max(1_000),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    reportIds: z.array(z.string().uuid()).max(100).default([]),
    decisionCode: z.string().trim().min(3).max(100).nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    policyVersion: z.string().trim().min(1).max(100).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.action === "dismiss" && input.targetType === "user") {
      ctx.addIssue({
        code: "custom",
        path: ["targetType"],
        message: "dismiss applies only to reported content",
      });
    }
    if (input.action === "dismiss" && input.reportIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["reportIds"],
        message: "dismiss requires at least one open report",
      });
    }
    const directContentAction = ["hide", "restore"].includes(input.action);
    if (directContentAction && !["review", "reply"].includes(input.targetType)) {
      ctx.addIssue({
        code: "custom",
        path: ["targetType"],
        message: "hide and restore require a review or reply target",
      });
    }
    if (
      ["restrict", "unrestrict", "ban", "unban"].includes(input.action) &&
      input.targetType !== "user"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["targetType"],
        message: "restriction actions require a user target",
      });
    }
  });

export const userRoleSchema = z.object({
  role: z.enum(["member", "operator", "moderator", "admin"]),
  reason: z.string().trim().min(3).max(1_000).default("Requested through Hub CLI"),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export type PluginListQuery = z.infer<typeof pluginListQuerySchema>;
export type MarketplaceListQuery = z.infer<typeof marketplaceListQuerySchema>;
