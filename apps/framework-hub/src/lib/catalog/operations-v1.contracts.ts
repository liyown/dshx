import { z } from "zod";

const boundedUrl = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "URL must use http or https");
const isoDateTime = z.string().datetime({ offset: true });
const dateOrDateTime = z.union([z.string().date(), isoDateTime]);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);
const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();
const hasUnsafeInstallSpecCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 32 || code === 127;
  });
const hasUnsupportedReportControl = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
  });
const canonicalRelativePath = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) =>
      value === "" ||
      (!value.startsWith("/") &&
        !value.endsWith("/") &&
        !value.includes("\\") &&
        value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")),
    "path must be a canonical relative path",
  );

export const operationIdentitySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("npm"),
      packageName: z
        .string()
        .trim()
        .min(1)
        .max(214)
        .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/)
        .refine(
          (value) => value === value.toLowerCase(),
          "packageName must be canonical lowercase",
        ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("github"),
      repositoryId: z.string().trim().min(1).max(128),
      fullName: z
        .string()
        .trim()
        .regex(/^[^/\s]+\/[^/\s]+$/)
        .max(300),
      subdirectory: canonicalRelativePath.default(""),
    })
    .strict(),
]);

export const operationSourceSchema = z
  .object({
    kind: z.enum(["npm", "github", "readme", "release", "manual"]),
    url: boundedUrl,
    ref: optionalText(500),
    etag: optionalText(500),
    contentHash: optionalText(256),
    availability: z.enum(["available", "unavailable"]),
  })
  .strict();

const detectionSignalSchema = z
  .object({
    kind: z.enum(["dsh.bundle.patch", "patch-file", "readme", "topic", "package-name", "manual"]),
    value: optionalText(1_000),
  })
  .strict();

const packageFactsSchema = z
  .object({
    name: optionalText(214),
    version: optionalText(100),
    description: optionalText(2_000),
    license: optionalText(100),
    homepageUrl: boundedUrl.optional(),
    repositoryUrl: boundedUrl.optional(),
    keywords: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    deprecated: z.boolean().optional(),
    publishedAt: isoDateTime.optional(),
  })
  .strict();

const repositoryFactsSchema = z
  .object({
    githubId: optionalText(128),
    fullName: optionalText(300),
    defaultBranch: optionalText(255),
    description: optionalText(2_000),
    homepageUrl: boundedUrl.optional(),
    topics: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    primaryLanguage: optionalText(100),
    licenseSpdx: optionalText(100),
    archived: z.boolean().optional(),
    disabled: z.boolean().optional(),
    stars: z.number().int().nonnegative().optional(),
    forks: z.number().int().nonnegative().optional(),
    openIssues: z.number().int().nonnegative().optional(),
    pushedAt: isoDateTime.optional(),
  })
  .strict();

const publisherFactsSchema = z
  .object({
    githubId: z.string().trim().min(1).max(128),
    login: z.string().trim().min(1).max(100),
    kind: z.enum(["user", "organization"]),
    avatarUrl: boundedUrl,
    profileUrl: boundedUrl,
  })
  .strict();

const readmeFactsSchema = z
  .object({
    availability: z.enum(["available", "unavailable"]),
    format: z.literal("markdown"),
    sourceUrl: boundedUrl,
    sourceRef: optionalText(500),
    path: optionalText(500),
    content: z.string().min(1).max(200_000).optional(),
    contentHash: sha256Hex.optional(),
  })
  .strict()
  .superRefine((readme, context) => {
    if (readme.availability === "available" && (!readme.content || !readme.contentHash))
      context.addIssue({
        code: "custom",
        message: "available README facts require exact content and contentHash",
      });
    if (readme.availability === "unavailable" && (readme.content || readme.contentHash))
      context.addIssue({
        code: "custom",
        message: "unavailable README facts cannot include content or contentHash",
      });
  });

const installTargetSchema = z
  .object({
    kind: z.enum(["npm", "github"]),
    spec: z.string().trim().min(1).max(1_000),
    packageName: optionalText(214),
    version: optionalText(100),
    packagePath: canonicalRelativePath.optional(),
    primary: z.boolean().optional(),
    available: z.boolean().optional(),
  })
  .strict();

const compatibilitySchema = z
  .object({
    declaredRange: optionalText(200),
    source: z.enum(["manifest", "peer-dependency", "readme"]).optional(),
  })
  .strict();

const metricFactsSchema = z
  .object({
    githubStars: z.number().int().nonnegative().optional(),
    githubForks: z.number().int().nonnegative().optional(),
    githubOpenIssues: z.number().int().nonnegative().optional(),
    npmDownloadsDay: z.number().int().nonnegative().optional(),
    npmDownloadsWeek: z.number().int().nonnegative().optional(),
  })
  .strict();

export const pluginObservationV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    observationId: sha256Hex,
    observedAt: isoDateTime,
    identity: operationIdentitySchema,
    source: operationSourceSchema,
    detection: z
      .object({
        signals: z.array(detectionSignalSchema).max(50),
      })
      .optional(),
    facts: z
      .object({
        package: packageFactsSchema.optional(),
        repository: repositoryFactsSchema.optional(),
        publisher: publisherFactsSchema.optional(),
        readme: readmeFactsSchema.optional(),
        installTargets: z.array(installTargetSchema).max(100).optional(),
        compatibility: compatibilitySchema.optional(),
        metrics: metricFactsSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((observation, context) => {
    const installTargets = observation.facts?.installTargets ?? [];
    const targetKeys = installTargets.map(
      (target) => `${target.kind}\u0000${target.spec}\u0000${target.packagePath ?? ""}`,
    );
    if (new Set(targetKeys).size !== targetKeys.length)
      context.addIssue({
        code: "custom",
        path: ["facts", "installTargets"],
        message: "install target kind, spec, and packagePath must be unique within one observation",
      });
    if (installTargets.filter((target) => target.primary === true).length > 1)
      context.addIssue({
        code: "custom",
        path: ["facts", "installTargets"],
        message: "an observation may declare at most one primary install target",
      });
    for (let index = 0; index < installTargets.length; index += 1) {
      const target = installTargets[index]!;
      if (hasUnsafeInstallSpecCharacter(target.spec) || target.spec.startsWith("-"))
        context.addIssue({
          code: "custom",
          path: ["facts", "installTargets", index, "spec"],
          message: "install target spec contains a command-injection structure",
        });
      const factPackageName = observation.facts?.package?.name;
      if (target.packageName && factPackageName && target.packageName !== factPackageName)
        context.addIssue({
          code: "custom",
          path: ["facts", "installTargets", index, "packageName"],
          message: "install target packageName must match the package fact",
        });
      if (target.kind === "npm") {
        const packageName =
          target.packageName ??
          factPackageName ??
          (observation.identity.kind === "npm" ? observation.identity.packageName : undefined);
        if (
          observation.identity.kind === "npm" &&
          target.packageName &&
          target.packageName !== observation.identity.packageName
        )
          context.addIssue({
            code: "custom",
            path: ["facts", "installTargets", index, "packageName"],
            message: "npm install target packageName must match the npm identity",
          });
        if (
          packageName &&
          target.spec !== packageName &&
          !target.spec.startsWith(`${packageName}@`)
        )
          context.addIssue({
            code: "custom",
            path: ["facts", "installTargets", index, "spec"],
            message: "npm install target spec must reference packageName",
          });
      }
      if (target.kind === "github" && observation.identity.kind === "github") {
        if (
          !target.spec
            .toLowerCase()
            .startsWith(`github:${observation.identity.fullName.toLowerCase()}#`)
        )
          context.addIssue({
            code: "custom",
            path: ["facts", "installTargets", index, "spec"],
            message: "GitHub install target spec must match the identity repository",
          });
      }
    }
    if (
      observation.identity.kind === "npm" &&
      observation.facts?.package?.name &&
      observation.facts.package.name !== observation.identity.packageName
    )
      context.addIssue({
        code: "custom",
        path: ["facts", "package", "name"],
        message: "package fact name must match the npm identity",
      });
    if (observation.identity.kind === "github" && observation.facts?.repository) {
      if (
        observation.facts.repository.githubId &&
        observation.facts.repository.githubId !== observation.identity.repositoryId
      )
        context.addIssue({
          code: "custom",
          path: ["facts", "repository", "githubId"],
          message: "repository fact githubId must match the GitHub identity",
        });
      if (
        observation.facts.repository.fullName &&
        observation.facts.repository.fullName.toLowerCase() !==
          observation.identity.fullName.toLowerCase()
      )
        context.addIssue({
          code: "custom",
          path: ["facts", "repository", "fullName"],
          message: "repository fact fullName must match the GitHub identity",
        });
    }
  });

export const observationBatchSchema = z
  .object({
    // Items are validated independently by the service so one malformed
    // observation cannot reject valid siblings.
    observations: z.array(z.unknown()).min(1).max(100),
    dryRun: z.boolean().default(false),
  })
  .strict();

const localizedTextSchema = (max: number) =>
  z
    .object({
      en: z.string().trim().min(1).max(max),
      zh: z.string().trim().min(1).max(max),
    })
    .strict();

export const pluginCurationContentSchema = z
  .object({
    displayName: localizedTextSchema(120),
    shortDescription: localizedTextSchema(240),
    overviewMarkdown: localizedTextSchema(8_000),
    sourceReadmeHash: sha256Hex.optional(),
    categories: z.array(z.string().trim().min(1).max(64)).min(1).max(20),
    tags: z.array(z.string().trim().min(1).max(64)).max(100),
    derivedFrom: z.array(boundedUrl).min(1).max(100),
  })
  .strict()
  .superRefine((content, context) => {
    for (const field of ["categories", "tags", "derivedFrom"] as const) {
      if (new Set(content[field]).size !== content[field].length)
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} must not contain duplicates`,
        });
    }
  });

export const pluginCurationRequestSchema = z
  .object({
    content: pluginCurationContentSchema,
    ifRevision: z.number().int().positive().optional(),
  })
  .strict();

export const pluginVisibilityRequestSchema = z
  .object({
    visibility: z.enum(["hidden", "visible"]),
    reason: z.string().trim().min(3).max(1_000),
  })
  .strict();

export const pluginStateValues = ["draft", "published", "hidden"] as const;
export const pluginNeedValues = [
  "refresh",
  "content",
  "metadata",
  "source",
  "target",
  "readme",
  "publisher",
] as const;
export const pluginRiskValues = [
  "runtime-not-verified",
  "compatibility-not-declared",
  "declared-range-mismatch",
  "install-target-unavailable",
  "repository-archived",
  "repository-disabled",
  "package-deprecated",
  "source-stale",
  "metadata-incomplete",
  "identity-conflict",
] as const;

export const opsPluginListQuerySchema = z
  .object({
    state: z.array(z.enum(pluginStateValues)).max(pluginStateValues.length).optional(),
    needs: z.array(z.enum(pluginNeedValues)).max(pluginNeedValues.length).optional(),
    source: z
      .array(z.enum(["npm", "github"]))
      .max(2)
      .optional(),
    risk: z.array(z.enum(pluginRiskValues)).max(pluginRiskValues.length).optional(),
    observedBefore: dateOrDateTime.optional(),
    updatedBefore: dateOrDateTime.optional(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().max(1_000).optional(),
  })
  .strict();

export const submissionListQuerySchema = z
  .object({
    status: z
      .array(z.enum(["queued", "discovered", "qualified", "rejected", "published", "resolved"]))
      .max(6)
      .optional(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().max(1_000).optional(),
  })
  .strict();

export const submissionResolutionSchema = z
  .object({
    result: z.enum(["accepted", "duplicate", "ignored"]),
    pluginId: z.string().uuid().optional(),
    reason: z.string().trim().min(3).max(1_000).optional(),
  })
  .strict()
  .superRefine((resolution, context) => {
    if (resolution.result !== "ignored" && !resolution.pluginId)
      context.addIssue({
        code: "custom",
        path: ["pluginId"],
        message: `${resolution.result} resolutions require pluginId`,
      });
    if (resolution.result === "ignored" && !resolution.reason)
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "ignored resolutions require reason",
      });
  });

export const operationMediaMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(["icon", "screenshot"]),
    sourceUrl: boundedUrl.optional(),
    observedAt: isoDateTime,
    sourceSha256: sha256Hex,
    altText: localizedTextSchema(240),
    caption: localizedTextSchema(500).optional(),
  })
  .strict();

export const operationAuditQuerySchema = z
  .object({
    scope: z.enum(["catalog", "storage", "community"]).default("catalog"),
  })
  .strict();

const reportTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(10_000)
  .refine(
    (value) => !hasUnsupportedReportControl(value),
    "report text contains unsupported control characters",
  );

export const operationReportInputSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    runId: z.string().uuid(),
    startedAt: isoDateTime,
    completedAt: isoDateTime,
    outcome: z.enum(["completed", "partial"]),
    body: z
      .object({
        en: reportTextSchema,
        zh: reportTextSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((report, context) => {
    if (Date.parse(report.completedAt) < Date.parse(report.startedAt))
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "completedAt must be at or after startedAt",
      });
  });

export const publicOperationReportQuerySchema = z
  .object({
    locale: z.enum(["en", "zh"]).default("en"),
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z.string().max(1_000).optional(),
  })
  .strict();

export const operationDryRunQuerySchema = z.enum(["true", "false"]);

export type OperationIdentity = z.infer<typeof operationIdentitySchema>;
export type PluginObservationV1 = z.infer<typeof pluginObservationV1Schema>;
export type PluginCurationContent = z.infer<typeof pluginCurationContentSchema>;
export type OpsPluginListQuery = z.infer<typeof opsPluginListQuerySchema>;
export type SubmissionListQuery = z.infer<typeof submissionListQuerySchema>;
export type SubmissionResolution = z.infer<typeof submissionResolutionSchema>;
export type OperationMediaMetadata = z.infer<typeof operationMediaMetadataSchema>;
export type OperationReportInput = z.infer<typeof operationReportInputSchema>;
export type PublicOperationReportQuery = z.infer<typeof publicOperationReportQuerySchema>;
