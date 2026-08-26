import { validRange } from "semver";
import { z } from "zod";

export const localeSchema = z.enum(["en", "zh"]);
export const syncModeSchema = z.enum(["bootstrap", "incremental", "full"]);

const boundedUrl = z.string().url().max(2_048);
const nullableUrl = boundedUrl.nullable().optional();
const isoDateTime = z.string().datetime({ offset: true });
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);
const compatibilityRangeSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => validRange(value, { includePrerelease: true }) !== null, {
    message: "compatibilityRange must be a valid semver range",
  });

function isSafeArtifactBasename(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 255 ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\")
  )
    return false;
  return ![...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export const capabilityKinds = [
  "tool",
  "service",
  "ui",
  "agent",
  "memory",
  "model",
  "integration",
] as const;

export const sourceObservationSchema = z.object({
  kind: z.string().trim().min(1).max(100),
  purpose: z.enum([
    "content",
    "repository",
    "package",
    "release",
    "license",
    "publisher",
    "link",
    "verification",
    "metric",
    "media",
  ]),
  url: boundedUrl,
  observedAt: isoDateTime,
  sha256: sha256Hex.nullable().optional(),
  etag: z.string().max(500).nullable().optional(),
  ref: z.string().max(500).nullable().optional(),
});

export const catalogIdentitySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("npm"),
    packageName: z.string().min(1).max(214),
  }),
  z.object({
    kind: z.literal("github"),
    repositoryId: z.string().min(1).max(64),
    subdirectory: z.literal(""),
  }),
]);

export const repositorySchema = z.object({
  githubId: z.string().min(1).max(64),
  nodeId: z.string().max(128).nullable().optional(),
  owner: z.object({
    githubId: z.string().min(1).max(64),
    login: z.string().min(1).max(128),
    kind: z.enum(["user", "organization"]),
    displayName: z.string().max(200).nullable().optional(),
    avatarUrl: nullableUrl,
    profileUrl: boundedUrl,
    bio: z.string().max(1_000).nullable().optional(),
    websiteUrl: nullableUrl,
    trustTier: z.enum(["official", "community"]).default("community"),
  }),
  name: z.string().min(1).max(200),
  fullName: z.string().min(3).max(300),
  canonicalUrl: boundedUrl,
  defaultBranch: z.string().min(1).max(255),
  description: z.string().max(1_000).nullable().optional(),
  homepageUrl: nullableUrl,
  topics: z.array(z.string().min(1).max(64)).max(50).default([]),
  primaryLanguage: z.string().max(100).nullable().optional(),
  licenseSpdx: z.string().max(100).nullable().optional(),
  isFork: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  isDisabled: z.boolean().default(false),
  stars: z.number().int().nonnegative().default(0),
  forks: z.number().int().nonnegative().default(0),
  openIssues: z.number().int().nonnegative().default(0),
  etag: z.string().max(500).nullable().optional(),
  contentHash: z.string().min(16).max(128),
  createdAt: isoDateTime.nullable().optional(),
  updatedAt: isoDateTime.nullable().optional(),
  pushedAt: isoDateTime.nullable().optional(),
});

export const verificationCheckSchema = z
  .object({
    code: z.string().min(1).max(100),
    status: z.enum(["pass", "fail", "warn"]),
    observed: z.record(z.string(), z.unknown()).nullable().optional(),
    evidenceUrl: nullableUrl,
    evidenceSha: z.string().max(128).nullable().optional(),
  })
  .superRefine((check, ctx) => {
    if (check.code !== "artifact.size" || check.observed == null) return;
    if (Object.hasOwn(check.observed, "path"))
      ctx.addIssue({
        code: "custom",
        path: ["observed", "path"],
        message: "artifact size evidence must not include a local path",
      });
    const file = check.observed["file"];
    if (file !== undefined && !isSafeArtifactBasename(file))
      ctx.addIssue({
        code: "custom",
        path: ["observed", "file"],
        message: "artifact size evidence file must be a safe basename",
      });
    const bytes = check.observed["bytes"];
    if (
      bytes !== undefined &&
      bytes !== null &&
      (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0)
    )
      ctx.addIssue({
        code: "custom",
        path: ["observed", "bytes"],
        message: "artifact size evidence bytes must be a non-negative integer",
      });
  });

export const verificationAttestationV1Schema = z.object({
  schemaVersion: z.literal(1),
  checkerVersion: z.string().min(1).max(100),
  checkedAt: isoDateTime,
  identityKey: z.string().min(3).max(500),
  artifactSha256: sha256Hex,
  packageJsonSha256: sha256Hex,
  patchSha256: sha256Hex,
  packageName: z.string().min(1).max(214),
  packageVersion: z.string().min(1).max(100),
  patchPath: z.string().min(1).max(500),
  dshxDetected: z.boolean(),
  qualified: z.literal(true),
  checks: z.array(verificationCheckSchema).min(1).max(50),
});

export const repositoryPackageSchema = z.object({
  subdirectory: z.string().max(500).default(""),
  packageName: z.string().min(1).max(214),
  packageVersion: z.string().max(100).nullable().optional(),
  packageJsonSha: z.string().min(7).max(128),
  patchPath: z.string().min(1).max(500),
  patchSha: z.string().max(128).nullable().optional(),
  npmPackageName: z.string().max(214).nullable().optional(),
  npmRegistryUrl: nullableUrl,
  installKind: z.enum(["npm", "github"]),
  installSpec: z.string().min(1).max(500),
  dshBundle: z.literal(true),
  dshxDetected: z.boolean().default(false),
  qualificationStatus: z.enum(["verified", "rejected", "unavailable"]),
  consecutiveFailures: z.number().int().min(0).max(100).default(0),
  checks: z.array(verificationCheckSchema).min(1).max(50),
});

export const localizationSchema = z.object({
  locale: localeSchema,
  displayName: z.string().trim().min(1).max(120),
  shortDescription: z.string().trim().min(20).max(240),
  overviewMarkdown: z.string().trim().min(40).max(8_000),
  highlights: z.array(z.string().trim().min(3).max(240)).min(2).max(8),
  installNotesMarkdown: z.string().trim().max(4_000).nullable().optional(),
  seoTitle: z.string().trim().min(8).max(80),
  seoDescription: z.string().trim().min(40).max(200),
  sourceLocale: localeSchema,
  sourceContentHash: z.string().min(16).max(128),
  status: z.enum(["pending", "ready", "stale", "rejected"]),
  translator: z.enum(["upstream", "agent", "manual"]),
});

export const dependencySchema = z.object({
  packageName: z.string().min(1).max(214),
  versionRange: z.string().min(1).max(200),
  kind: z.enum(["runtime", "peer", "optional"]),
});

export const releaseSchema = z.object({
  version: z.string().min(1).max(100),
  channel: z.enum(["stable", "prerelease"]).default("stable"),
  gitTag: z.string().max(255).nullable().optional(),
  commitSha: z.string().max(128).nullable().optional(),
  compatibilityRange: compatibilityRangeSchema.nullable().optional(),
  compatibilitySource: z
    .enum(["manifest", "peer-dependency", "inferred", "unknown"])
    .default("unknown"),
  releaseNotesUrl: nullableUrl,
  deprecated: z.boolean().default(false),
  publishedAt: isoDateTime.nullable().optional(),
  dependencies: z.array(dependencySchema).max(200).default([]),
});

export const catalogSyncItemV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    itemKey: z.string().min(3).max(500),
    contentHash: z.string().min(16).max(128),
    repository: repositorySchema,
    repositoryPackage: repositoryPackageSchema,
    plugin: z.object({
      id: z.string().uuid(),
      slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(100),
      identityKey: z.string().min(3).max(500),
      packageName: z.string().min(1).max(214),
      badge: z.enum(["official", "verified", "community"]).default("community"),
      trustTier: z.enum(["official", "community"]).default("community"),
      latestVersion: z.string().min(1).max(100),
      compatibilityRange: compatibilityRangeSchema,
      licenseSpdx: z.string().max(100).nullable().optional(),
      homepageUrl: nullableUrl,
      repositoryUrl: boundedUrl,
      dshxDetected: z.boolean().default(false),
      featured: z.boolean().default(false),
    }),
    localizations: z.array(localizationSchema).min(1).max(2),
    installTargets: z
      .array(
        z.object({
          kind: z.enum(["npm", "github"]),
          spec: z.string().min(1).max(500),
          packageName: z.string().min(1).max(214),
          version: z.string().min(1).max(100),
          integrity: z.string().max(500).nullable().optional(),
          primary: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(5),
    releases: z.array(releaseSchema).min(1).max(20),
    categories: z.array(z.string().min(1).max(64)).min(1).max(4),
    capabilities: z
      .array(
        z.object({
          kind: z.enum(["tool", "service", "ui", "agent", "memory", "model", "integration"]),
          identifier: z.string().min(1).max(200),
          observed: z.boolean().default(true),
          metadata: z.record(z.string(), z.unknown()).nullable().optional(),
        }),
      )
      .max(100)
      .default([]),
    links: z
      .array(
        z.object({
          kind: z.enum(["homepage", "repository", "docs", "issues", "funding", "npm"]),
          url: boundedUrl,
          label: z.string().max(100).nullable().optional(),
        }),
      )
      .max(20)
      .default([]),
    sources: z.array(sourceObservationSchema).max(100).default([]),
    verification: verificationAttestationV1Schema.optional(),
    media: z
      .array(
        z.object({
          kind: z.enum(["icon", "screenshot"]),
          sourceUrl: boundedUrl,
          sha256: z.string().length(64),
          contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/avif"]),
          byteSize: z
            .number()
            .int()
            .positive()
            .max(5 * 1024 * 1024),
          width: z.number().int().positive().max(8_192).nullable().optional(),
          height: z.number().int().positive().max(8_192).nullable().optional(),
          localizations: z.array(
            z.object({
              locale: localeSchema,
              altText: z.string().min(1).max(240),
              caption: z.string().max(500).nullable().optional(),
            }),
          ),
        }),
      )
      .max(10)
      .default([]),
    metrics: z
      .object({
        snapshotDate: z.string().date(),
        githubStars: z.number().int().nonnegative(),
        githubForks: z.number().int().nonnegative(),
        githubOpenIssues: z.number().int().nonnegative(),
        npmDownloadsDay: z.number().int().nonnegative().nullable().optional(),
        npmDownloadsWeek: z.number().int().nonnegative().nullable().optional(),
        trendScore7d: z.number().int().default(0),
        trendScore30d: z.number().int().default(0),
      })
      .optional(),
  })
  .superRefine((item, ctx) => {
    if (!item.installTargets.some((target) => target.primary)) {
      ctx.addIssue({
        code: "custom",
        path: ["installTargets"],
        message: "one primary install target is required",
      });
    }
    const locales = new Set(item.localizations.map((entry) => entry.locale));
    if (locales.size !== item.localizations.length) {
      ctx.addIssue({ code: "custom", path: ["localizations"], message: "locales must be unique" });
    }
  });

const proposalRepositorySchema = repositorySchema
  .omit({ stars: true, forks: true, openIssues: true, contentHash: true })
  .extend({
    owner: repositorySchema.shape.owner.omit({ trustTier: true }),
    sourceHash: sha256Hex,
  });

const proposalRepositoryPackageSchema = repositoryPackageSchema.extend({
  packageJsonSha: sha256Hex,
  patchSha: sha256Hex,
  qualificationStatus: z.literal("verified"),
  consecutiveFailures: z.literal(0).default(0),
});

const proposalPluginSchema = z.object({
  requestedSlug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100)
    .nullable()
    .optional(),
  packageName: z.string().min(1).max(214),
  latestVersion: z.string().min(1).max(100),
  compatibilityRange: compatibilityRangeSchema,
  licenseSpdx: z.string().max(100).nullable().optional(),
  homepageUrl: nullableUrl,
  repositoryUrl: boundedUrl,
  dshxDetected: z.boolean(),
});

export const catalogProposalV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    identity: catalogIdentitySchema,
    contentSourceHash: sha256Hex,
    sources: z.array(sourceObservationSchema).min(1).max(100),
    verification: verificationAttestationV1Schema,
    repository: proposalRepositorySchema,
    repositoryPackage: proposalRepositoryPackageSchema,
    plugin: proposalPluginSchema,
    localizations: z.array(localizationSchema).length(2),
    installTargets: catalogSyncItemV1Schema.shape.installTargets,
    releases: catalogSyncItemV1Schema.shape.releases,
    categories: catalogSyncItemV1Schema.shape.categories,
    capabilities: catalogSyncItemV1Schema.shape.capabilities,
    links: catalogSyncItemV1Schema.shape.links,
  })
  .superRefine((item, ctx) => {
    const identityKey =
      item.identity.kind === "npm"
        ? `npm:${item.identity.packageName}`
        : `github:${item.identity.repositoryId}:${item.identity.subdirectory}`;
    if (item.verification.identityKey !== identityKey)
      ctx.addIssue({
        code: "custom",
        path: ["verification", "identityKey"],
        message: "verification identity does not match proposal identity",
      });
    if (item.identity.kind === "npm") {
      if (
        item.repositoryPackage.installKind !== "npm" ||
        item.repositoryPackage.npmPackageName !== item.identity.packageName
      )
        ctx.addIssue({
          code: "custom",
          path: ["repositoryPackage"],
          message: "npm identity must match the verified npm package",
        });
    } else if (
      item.repositoryPackage.installKind !== "github" ||
      item.repository.githubId !== item.identity.repositoryId ||
      item.repositoryPackage.subdirectory !== ""
    )
      ctx.addIssue({
        code: "custom",
        path: ["repositoryPackage"],
        message: "GitHub identity requires a verified repository-root package",
      });
    if (item.plugin.packageName !== item.verification.packageName)
      ctx.addIssue({
        code: "custom",
        path: ["plugin", "packageName"],
        message: "plugin package name must match the verified artifact",
      });
    if (
      item.repositoryPackage.packageName !== item.verification.packageName ||
      item.repositoryPackage.packageVersion !== item.verification.packageVersion ||
      item.repositoryPackage.packageJsonSha !== item.verification.packageJsonSha256 ||
      item.repositoryPackage.patchPath !== item.verification.patchPath ||
      item.repositoryPackage.patchSha !== item.verification.patchSha256 ||
      item.repositoryPackage.dshxDetected !== item.verification.dshxDetected ||
      item.verification.checks.some((check) => check.status === "fail")
    )
      ctx.addIssue({
        code: "custom",
        path: ["verification"],
        message: "package facts must match a passing verification attestation",
      });
    if (JSON.stringify(item.repositoryPackage.checks) !== JSON.stringify(item.verification.checks))
      ctx.addIssue({
        code: "custom",
        path: ["repositoryPackage", "checks"],
        message: "repository package checks must match verification attestation checks",
      });
    if (item.plugin.repositoryUrl !== item.repository.canonicalUrl)
      ctx.addIssue({
        code: "custom",
        path: ["plugin", "repositoryUrl"],
        message: "plugin repository URL must match the verified canonical repository",
      });
    if (
      item.identity.kind === "github" &&
      !item.releases.some((release) => release.channel === "stable" && release.gitTag)
    )
      ctx.addIssue({
        code: "custom",
        path: ["releases"],
        message: "GitHub-only plugins require a stable tagged release",
      });
    if (!item.installTargets.some((target) => target.primary))
      ctx.addIssue({
        code: "custom",
        path: ["installTargets"],
        message: "one primary install target is required",
      });
    const primaryTargets = item.installTargets.filter((target) => target.primary);
    const primaryTarget = primaryTargets[0];
    const latestStableRelease = item.releases.find(
      (release) =>
        release.version === item.plugin.latestVersion &&
        release.channel === "stable" &&
        typeof release.gitTag === "string" &&
        release.gitTag.length > 0,
    );
    const exactInstallSpec =
      item.identity.kind === "npm"
        ? `${item.plugin.packageName}@${item.plugin.latestVersion}`
        : latestStableRelease?.gitTag
          ? `github:${item.repository.fullName}#${latestStableRelease.gitTag}`
          : undefined;
    if (
      primaryTargets.length !== 1 ||
      !primaryTarget ||
      exactInstallSpec === undefined ||
      item.repositoryPackage.installSpec !== exactInstallSpec ||
      primaryTarget.kind !== item.repositoryPackage.installKind ||
      primaryTarget.spec !== exactInstallSpec ||
      primaryTarget.packageName !== item.repositoryPackage.packageName ||
      primaryTarget.version !== item.repositoryPackage.packageVersion
    )
      ctx.addIssue({
        code: "custom",
        path: ["installTargets"],
        message:
          "exactly one primary target must use the verified package's immutable install spec",
      });
    if (
      new Set(item.installTargets.map((target) => `${target.kind}:${target.spec}`)).size !==
      item.installTargets.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["installTargets"],
        message: "install targets must be unique",
      });
    if (
      item.plugin.latestVersion !== item.verification.packageVersion ||
      !item.releases.some((release) => release.version === item.plugin.latestVersion) ||
      new Set(item.releases.map((release) => release.version)).size !== item.releases.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["releases"],
        message: "releases must be unique and include the verified latest version",
      });
    if (new Set(item.categories).size !== item.categories.length)
      ctx.addIssue({
        code: "custom",
        path: ["categories"],
        message: "categories must be unique",
      });
    const locales = new Set(item.localizations.map((entry) => entry.locale));
    if (
      locales.size !== 2 ||
      item.localizations.some(
        (entry) => entry.status !== "ready" || entry.sourceContentHash !== item.contentSourceHash,
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["localizations"],
        message: "ready en and zh localizations must match contentSourceHash",
      });
    if (!item.sources.some((source) => source.purpose === "content" && source.sha256))
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message: "at least one hashed content source is required",
      });
    if (
      !item.sources.some(
        (source) =>
          source.purpose === "verification" && source.sha256 === item.verification.artifactSha256,
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message: "a verification source must match the attested artifact hash",
      });
  });

export const syncRunCreateSchema = z.object({
  mode: syncModeSchema,
  idempotencyKey: z.string().min(8).max(200),
  expectedItems: z.number().int().min(1).max(500),
  cliVersion: z.string().max(100).nullable().optional(),
  checkerVersion: z.string().max(100).nullable().optional(),
  cursor: z.record(z.string(), z.unknown()).nullable().optional(),
  schemaVersion: z.literal(2),
});

export const syncItemPageSchema = z.object({
  items: z.array(catalogProposalV2Schema).min(1).max(100),
});

export const pluginListQuerySchema = z.object({
  locale: localeSchema.default("en"),
  q: z.string().trim().max(80).default(""),
  category: z.string().max(64).nullable().optional(),
  sort: z
    .enum(["featured", "trending", "updated", "new", "stars", "downloads"])
    .default("featured"),
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
    badge: z.enum(["official", "verified", "community"]),
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

export const inventoryQuerySchema = z.object({
  cursor: z.string().max(500).nullable().optional(),
  limit: z.number().int().min(1).max(100).default(100),
});

export const metricSnapshotSchema = z.object({
  pluginId: z.string().uuid(),
  snapshotDate: z.string().date(),
  githubStars: z.number().int().nonnegative(),
  githubForks: z.number().int().nonnegative(),
  githubOpenIssues: z.number().int().nonnegative(),
  npmDownloadsDay: z.number().int().nonnegative().nullable().optional(),
  npmDownloadsWeek: z.number().int().nonnegative().nullable().optional(),
});

export const metricSnapshotPageSchema = z.object({
  snapshots: z.array(metricSnapshotSchema).min(1).max(100),
});

export const metricObservationV2Schema = z.object({
  schemaVersion: z.literal(2),
  observedAt: isoDateTime,
  sources: z.array(sourceObservationSchema).min(1).max(20),
  metrics: metricSnapshotSchema,
});

export const metricObservationPageV2Schema = z.object({
  observations: z.array(metricObservationV2Schema).min(1).max(100),
});

export const maintenanceAuditQuerySchema = z.object({
  scope: z.enum(["daily", "full"]).default("daily"),
});

export const targetObservationV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    repositoryPackageId: z.string().min(1).max(500),
    status: z.enum(["pass", "fail"]),
    sources: z.array(sourceObservationSchema).min(1).max(20),
    verification: verificationAttestationV1Schema.nullable(),
    checks: z
      .array(
        z.object({
          code: z.string().min(1).max(100),
          status: z.enum(["pass", "fail", "warn"]),
          message: z.string().max(1_000),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((observation, ctx) => {
    const full = observation.checks.find((check) => check.code === "install_target.full");
    if (!full || full.status !== observation.status)
      ctx.addIssue({
        code: "custom",
        path: ["checks"],
        message: "install_target.full must match the submitted target status",
      });
    if (observation.status === "pass" && !observation.verification)
      ctx.addIssue({
        code: "custom",
        path: ["verification"],
        message: "passing target observations require a qualified attestation",
      });
  });

export const targetVerificationPageSchema = z
  .object({
    schemaVersion: z.literal(2),
    idempotencyKey: z.string().trim().min(8).max(200),
    checkedAt: z.string().datetime({ offset: true }),
    results: z.array(targetObservationV2Schema).min(1).max(100),
  })
  .refine(
    (input) =>
      new Set(input.results.map((result) => result.repositoryPackageId)).size ===
      input.results.length,
    {
      path: ["results"],
      message: "target observations must be unique",
    },
  );

export const mediaUploadMetadataV2Schema = z.object({
  schemaVersion: z.literal(2),
  pluginId: z.string().uuid(),
  kind: z.enum(["icon", "screenshot"]),
  sourceUrl: boundedUrl,
  observedAt: isoDateTime,
  sourceSha256: sha256Hex,
  localizations: z
    .array(
      z.object({
        locale: localeSchema,
        altText: z.string().trim().min(1).max(240),
        caption: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .length(2)
    .refine((entries) => new Set(entries.map((entry) => entry.locale)).size === 2),
});

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

export type CatalogSyncItemV1 = z.infer<typeof catalogSyncItemV1Schema>;
export type CatalogProposalV2 = z.infer<typeof catalogProposalV2Schema>;
export type PluginListQuery = z.infer<typeof pluginListQuerySchema>;
export type MarketplaceListQuery = z.infer<typeof marketplaceListQuerySchema>;
export type MetricSnapshot = z.infer<typeof metricSnapshotSchema>;
export type MetricObservationV2 = z.infer<typeof metricObservationV2Schema>;
