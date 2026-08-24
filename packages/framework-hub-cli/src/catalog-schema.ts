import { createHash } from "node:crypto";

import { z } from "zod";

const url = z.string().url().max(2_048);
const nullableUrl = url.nullable().optional();
const dateTime = z.string().datetime({ offset: true });
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const locale = z.enum(["en", "zh"]);

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
  url,
  observedAt: dateTime,
  sha256: sha256.nullable().optional(),
  etag: z.string().max(500).nullable().optional(),
  ref: z.string().max(500).nullable().optional(),
});

export const catalogIdentitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("npm"), packageName: z.string().min(1).max(214) }),
  z.object({
    kind: z.literal("github"),
    repositoryId: z.string().min(1).max(64),
    subdirectory: z.literal(""),
  }),
]);

export const verificationCheckSchema = z.object({
  code: z.string().min(1).max(100),
  status: z.enum(["pass", "fail", "warn"]),
  message: z.string().max(1_000).optional(),
  observed: z.record(z.string(), z.unknown()).nullable().optional(),
  evidenceUrl: nullableUrl,
  evidenceSha: z.string().max(128).nullable().optional(),
});

export const verificationAttestationV1Schema = z.object({
  schemaVersion: z.literal(1),
  checkerVersion: z.string().min(1).max(100),
  checkedAt: dateTime,
  identityKey: z.string().min(3).max(500),
  artifactSha256: sha256,
  packageJsonSha256: sha256,
  patchSha256: sha256,
  packageName: z.string().min(1).max(214),
  packageVersion: z.string().min(1).max(100),
  patchPath: z.string().min(1).max(500),
  dshxDetected: z.boolean(),
  qualified: z.literal(true),
  checks: z.array(verificationCheckSchema).min(1).max(50),
});

const owner = z.object({
  githubId: z.string().min(1).max(64),
  login: z.string().min(1).max(128),
  kind: z.enum(["user", "organization"]),
  displayName: z.string().max(200).nullable().optional(),
  avatarUrl: nullableUrl,
  profileUrl: url,
  bio: z.string().max(1_000).nullable().optional(),
  websiteUrl: nullableUrl,
});

const repository = z.object({
  githubId: z.string().min(1).max(64),
  nodeId: z.string().max(128).nullable().optional(),
  owner,
  name: z.string().min(1).max(200),
  fullName: z.string().min(3).max(300),
  canonicalUrl: url,
  defaultBranch: z.string().min(1).max(255),
  description: z.string().max(1_000).nullable().optional(),
  homepageUrl: nullableUrl,
  topics: z.array(z.string().min(1).max(64)).max(50).default([]),
  primaryLanguage: z.string().max(100).nullable().optional(),
  licenseSpdx: z.string().max(100).nullable().optional(),
  isFork: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  isDisabled: z.boolean().default(false),
  etag: z.string().max(500).nullable().optional(),
  sourceHash: sha256,
  createdAt: dateTime.nullable().optional(),
  updatedAt: dateTime.nullable().optional(),
  pushedAt: dateTime.nullable().optional(),
});

const localization = z.object({
  locale,
  displayName: z.string().trim().min(1).max(120),
  shortDescription: z.string().trim().min(20).max(240),
  overviewMarkdown: z.string().trim().min(40).max(8_000),
  highlights: z.array(z.string().trim().min(3).max(240)).min(2).max(8),
  installNotesMarkdown: z.string().trim().max(4_000).nullable().optional(),
  seoTitle: z.string().trim().min(8).max(80),
  seoDescription: z.string().trim().min(40).max(200),
  sourceLocale: locale,
  sourceContentHash: sha256,
  status: z.literal("ready"),
  translator: z.enum(["upstream", "agent", "manual"]),
});

const dependency = z.object({
  packageName: z.string().min(1).max(214),
  versionRange: z.string().min(1).max(200),
  kind: z.enum(["runtime", "peer", "optional"]),
});

const release = z.object({
  version: z.string().min(1).max(100),
  channel: z.enum(["stable", "prerelease"]).default("stable"),
  gitTag: z.string().max(255).nullable().optional(),
  commitSha: z.string().max(128).nullable().optional(),
  compatibilityRange: z.string().max(200).nullable().optional(),
  compatibilitySource: z
    .enum(["manifest", "peer-dependency", "inferred", "unknown"])
    .default("unknown"),
  releaseNotesUrl: nullableUrl,
  deprecated: z.boolean().default(false),
  publishedAt: dateTime.nullable().optional(),
  dependencies: z.array(dependency).max(200).default([]),
});

export const catalogProposalV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    identity: catalogIdentitySchema,
    contentSourceHash: sha256,
    sources: z.array(sourceObservationSchema).min(1).max(100),
    verification: verificationAttestationV1Schema,
    repository,
    repositoryPackage: z.object({
      subdirectory: z.string().max(500).default(""),
      packageName: z.string().min(1).max(214),
      packageVersion: z.string().min(1).max(100),
      packageJsonSha: sha256,
      patchPath: z.string().min(1).max(500),
      patchSha: sha256,
      npmPackageName: z.string().max(214).nullable().optional(),
      npmRegistryUrl: nullableUrl,
      installKind: z.enum(["npm", "github"]),
      installSpec: z.string().min(1).max(500),
      dshBundle: z.literal(true),
      dshxDetected: z.boolean(),
      qualificationStatus: z.literal("verified"),
      consecutiveFailures: z.literal(0).default(0),
      checks: z.array(verificationCheckSchema).min(1).max(50),
    }),
    plugin: z.object({
      requestedSlug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(100)
        .nullable()
        .optional(),
      packageName: z.string().min(1).max(214),
      latestVersion: z.string().min(1).max(100),
      compatibilityRange: z.string().min(1).max(200),
      licenseSpdx: z.string().max(100).nullable().optional(),
      homepageUrl: nullableUrl,
      repositoryUrl: url,
      dshxDetected: z.boolean(),
    }),
    localizations: z.array(localization).length(2),
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
    releases: z.array(release).min(1).max(20),
    categories: z.array(z.string().min(1).max(64)).min(1).max(4),
    capabilities: z
      .array(
        z.object({
          kind: z.enum([
            "tool",
            "service",
            "ui",
            "agent",
            "memory",
            "model",
            "integration",
          ]),
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
          kind: z.enum([
            "homepage",
            "repository",
            "docs",
            "issues",
            "funding",
            "npm",
          ]),
          url,
          label: z.string().max(100).nullable().optional(),
        }),
      )
      .max(20)
      .default([]),
  })
  .superRefine((proposal, ctx) => {
    const identityKey = identityKeyFor(proposal.identity);
    if (proposal.verification.identityKey !== identityKey)
      ctx.addIssue({
        code: "custom",
        path: ["verification", "identityKey"],
        message: "verification identity does not match proposal identity",
      });
    if (
      proposal.verification.packageName !== proposal.plugin.packageName ||
      proposal.verification.packageName !==
        proposal.repositoryPackage.packageName ||
      proposal.verification.packageVersion !==
        proposal.repositoryPackage.packageVersion ||
      proposal.verification.packageJsonSha256 !==
        proposal.repositoryPackage.packageJsonSha ||
      proposal.verification.patchSha256 !==
        proposal.repositoryPackage.patchSha ||
      proposal.verification.patchPath !==
        proposal.repositoryPackage.patchPath ||
      proposal.verification.dshxDetected !==
        proposal.repositoryPackage.dshxDetected ||
      proposal.verification.checks.some((check) => check.status === "fail")
    )
      ctx.addIssue({
        code: "custom",
        path: ["verification"],
        message: "package facts must match a passing verification attestation",
      });
    if (proposal.identity.kind === "npm") {
      if (
        proposal.repositoryPackage.installKind !== "npm" ||
        proposal.repositoryPackage.npmPackageName !==
          proposal.identity.packageName
      )
        ctx.addIssue({
          code: "custom",
          path: ["repositoryPackage"],
          message: "npm identity must match the verified npm package",
        });
    } else if (
      proposal.repositoryPackage.installKind !== "github" ||
      proposal.repository.githubId !== proposal.identity.repositoryId ||
      proposal.repositoryPackage.subdirectory !== "" ||
      !proposal.releases.some(
        (entry) => entry.channel === "stable" && entry.gitTag,
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["repositoryPackage"],
        message:
          "GitHub identity requires a verified tagged repository-root package",
      });
    if (!proposal.installTargets.some((target) => target.primary))
      ctx.addIssue({
        code: "custom",
        path: ["installTargets"],
        message: "one primary install target is required",
      });
    const primaryTargets = proposal.installTargets.filter(
      (target) => target.primary,
    );
    const primaryTarget = primaryTargets[0];
    if (
      primaryTargets.length !== 1 ||
      !primaryTarget ||
      primaryTarget.kind !== proposal.repositoryPackage.installKind ||
      primaryTarget.spec !== proposal.repositoryPackage.installSpec ||
      primaryTarget.packageName !== proposal.repositoryPackage.packageName ||
      primaryTarget.version !== proposal.repositoryPackage.packageVersion
    )
      ctx.addIssue({
        code: "custom",
        path: ["installTargets"],
        message: "exactly one primary target must match the verified package",
      });
    if (
      new Set(
        proposal.installTargets.map(
          (target) => `${target.kind}:${target.spec}`,
        ),
      ).size !== proposal.installTargets.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["installTargets"],
        message: "install targets must be unique",
      });
    if (
      proposal.plugin.latestVersion !== proposal.verification.packageVersion ||
      !proposal.releases.some(
        (release) => release.version === proposal.plugin.latestVersion,
      ) ||
      new Set(proposal.releases.map((release) => release.version)).size !==
        proposal.releases.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["releases"],
        message:
          "releases must be unique and include the verified latest version",
      });
    if (new Set(proposal.categories).size !== proposal.categories.length)
      ctx.addIssue({
        code: "custom",
        path: ["categories"],
        message: "categories must be unique",
      });
    if (
      new Set(proposal.localizations.map((entry) => entry.locale)).size !== 2 ||
      proposal.localizations.some(
        (entry) => entry.sourceContentHash !== proposal.contentSourceHash,
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["localizations"],
        message: "ready en and zh localizations must match contentSourceHash",
      });
    if (
      !proposal.sources.some(
        (source) => source.purpose === "content" && source.sha256,
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message: "at least one hashed content source is required",
      });
    if (
      !proposal.sources.some(
        (source) =>
          source.purpose === "verification" &&
          source.sha256 === proposal.verification.artifactSha256,
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["sources"],
        message: "a verification source must match the attested artifact hash",
      });
  });

export const catalogProposalPageV2Schema = z.object({
  items: z.array(catalogProposalV2Schema).min(1).max(100),
});

export const evidenceManifestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    identity: catalogIdentitySchema,
    repository: z.object({
      archived: z.boolean().default(false),
      disabled: z.boolean().default(false),
    }),
    artifact: z.object({
      path: z.string().min(1),
      kind: z.enum(["npm-tgz", "git-tgz"]),
      integrity: z.string().min(8).max(500).nullable().optional(),
      stableTag: z.string().max(255).nullable().optional(),
      archiveRoot: z.string().max(500).default(""),
    }),
    package: z.object({
      subdirectory: z.string().max(500).default(""),
    }),
    sources: z.array(sourceObservationSchema).min(1).max(100),
  })
  .refine(
    (input) =>
      input.sources.some(
        (source) =>
          source.purpose === "verification" &&
          typeof source.sha256 === "string",
      ),
    {
      path: ["sources"],
      message:
        "a hashed verification source for the local artifact is required",
    },
  );

export const metricObservationV2Schema = z.object({
  schemaVersion: z.literal(2),
  observedAt: dateTime,
  sources: z.array(sourceObservationSchema).min(1).max(20),
  metrics: z.object({
    pluginId: z.string().uuid(),
    snapshotDate: z.string().date(),
    githubStars: z.number().int().nonnegative(),
    githubForks: z.number().int().nonnegative(),
    githubOpenIssues: z.number().int().nonnegative(),
    npmDownloadsDay: z.number().int().nonnegative().nullable().optional(),
    npmDownloadsWeek: z.number().int().nonnegative().nullable().optional(),
  }),
});

export const metricObservationPageV2Schema = z.object({
  observations: z.array(metricObservationV2Schema).min(1).max(10_000),
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
    const full = observation.checks.find(
      (check) => check.code === "install_target.full",
    );
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

export const targetSubmissionV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    checkedAt: dateTime,
    results: z.array(targetObservationV2Schema).min(1).max(10_000),
  })
  .refine(
    (input) =>
      new Set(input.results.map((result) => result.repositoryPackageId))
        .size === input.results.length,
    { path: ["results"], message: "target observations must be unique" },
  );

export const mediaUploadV2Schema = z.object({
  schemaVersion: z.literal(2),
  pluginId: z.string().uuid(),
  kind: z.enum(["icon", "screenshot"]),
  sourceUrl: url,
  observedAt: dateTime,
  sourceSha256: sha256.nullable().optional(),
  localPath: z.string().min(1),
  localizations: z
    .array(
      z.object({
        locale,
        altText: z.string().trim().min(1).max(240),
        caption: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .length(2)
    .refine(
      (entries) => new Set(entries.map((entry) => entry.locale)).size === 2,
    ),
});

export const mediaUploadPageV2Schema = z.object({
  items: z.array(mediaUploadV2Schema).min(1).max(100),
});

export function identityKeyFor(
  identity: z.infer<typeof catalogIdentitySchema>,
): string {
  return identity.kind === "npm"
    ? `npm:${identity.packageName}`
    : `github:${identity.repositoryId}:${identity.subdirectory}`;
}

export function contentSourceMaterial(
  sources: Array<z.infer<typeof sourceObservationSchema>>,
): string {
  return sources
    .filter(
      (source): source is typeof source & { sha256: string } =>
        source.purpose === "content" && typeof source.sha256 === "string",
    )
    .map((source) => `${source.url}\u0000${source.sha256}`)
    .sort()
    .join("\n");
}

export function calculateContentSourceHash(
  sources: Array<z.infer<typeof sourceObservationSchema>>,
): string {
  return createHash("sha256")
    .update(contentSourceMaterial(sources))
    .digest("hex");
}

export type CatalogProposalV2 = z.infer<typeof catalogProposalV2Schema>;
export type EvidenceManifestV1 = z.infer<typeof evidenceManifestV1Schema>;
export type VerificationAttestationV1 = z.infer<
  typeof verificationAttestationV1Schema
>;
