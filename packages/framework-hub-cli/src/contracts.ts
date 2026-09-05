import { createHash } from "node:crypto";

import { z } from "zod";

import { CliError } from "./errors.js";

const urlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine(
    (value) => {
      try {
        return ["http:", "https:"].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    },
    { message: "URL must use HTTP or HTTPS" },
  );
const dateTimeSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const sourceFingerprintSchema = z.string().trim().min(1).max(256);
const npmPackageNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(214)
  .regex(
    /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/,
  );
const githubSubdirectorySchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) =>
      value === "" ||
      (!value.startsWith("/") &&
        !value.endsWith("/") &&
        !value.includes("\\") &&
        value
          .split("/")
          .every(
            (segment) => segment !== "" && segment !== "." && segment !== "..",
          )),
    { message: "subdirectory must be a canonical relative path" },
  );

export const observationIdentitySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("npm"),
      packageName: npmPackageNameSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("github"),
      repositoryId: z.string().trim().min(1).max(128),
      fullName: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
        .max(300),
      subdirectory: githubSubdirectorySchema,
    })
    .strict(),
]);

export const observationSourceSchema = z
  .object({
    kind: z.enum(["npm", "github", "readme", "release", "manual"]),
    url: urlSchema,
    ref: z.string().trim().min(1).max(500).optional(),
    etag: z.string().trim().min(1).max(500).optional(),
    contentHash: sourceFingerprintSchema.optional(),
    availability: z.enum(["available", "unavailable"]),
  })
  .strict();

export const detectionSignalSchema = z
  .object({
    kind: z.enum([
      "dsh.bundle.patch",
      "patch-file",
      "readme",
      "topic",
      "package-name",
      "manual",
    ]),
    value: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

const packageFactsSchema = z
  .object({
    name: z.string().trim().min(1).max(214).optional(),
    version: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().min(1).max(2_000).optional(),
    license: z.string().trim().min(1).max(100).optional(),
    homepageUrl: urlSchema.optional(),
    repositoryUrl: urlSchema.optional(),
    keywords: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    deprecated: z.boolean().optional(),
    publishedAt: dateTimeSchema.optional(),
  })
  .strict();

const repositoryFactsSchema = z
  .object({
    githubId: z.string().trim().min(1).max(128).optional(),
    fullName: z.string().trim().min(3).max(300).optional(),
    defaultBranch: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().min(1).max(2_000).optional(),
    homepageUrl: urlSchema.optional(),
    topics: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    primaryLanguage: z.string().trim().min(1).max(100).optional(),
    licenseSpdx: z.string().trim().min(1).max(100).optional(),
    archived: z.boolean().optional(),
    disabled: z.boolean().optional(),
    stars: z.number().int().nonnegative().optional(),
    forks: z.number().int().nonnegative().optional(),
    openIssues: z.number().int().nonnegative().optional(),
    pushedAt: dateTimeSchema.optional(),
  })
  .strict();

const publisherFactsSchema = z
  .object({
    githubId: z.string().trim().min(1).max(128),
    login: z.string().trim().min(1).max(100),
    kind: z.enum(["user", "organization"]),
    avatarUrl: urlSchema,
    profileUrl: urlSchema,
  })
  .strict();

const readmeFactsSchema = z
  .object({
    availability: z.enum(["available", "unavailable"]),
    format: z.literal("markdown"),
    sourceUrl: urlSchema,
    sourceRef: z.string().trim().min(1).max(500).optional(),
    path: z.string().trim().min(1).max(500).optional(),
    content: z.string().min(1).max(200_000).optional(),
    contentHash: sha256Schema.optional(),
  })
  .strict()
  .superRefine((readme, context) => {
    if (
      readme.availability === "available" &&
      (!readme.content || !readme.contentHash)
    )
      context.addIssue({
        code: "custom",
        message: "available README facts require exact content and contentHash",
      });
    if (
      readme.availability === "unavailable" &&
      (readme.content || readme.contentHash)
    )
      context.addIssue({
        code: "custom",
        message:
          "unavailable README facts cannot include content or contentHash",
      });
  });

const installTargetSchema = z
  .object({
    kind: z.enum(["npm", "github"]),
    spec: z.string().trim().min(1).max(1_000),
    packageName: z.string().trim().min(1).max(214).optional(),
    version: z.string().trim().min(1).max(100).optional(),
    packagePath: githubSubdirectorySchema.optional(),
    primary: z.boolean().optional(),
    available: z.boolean().optional(),
  })
  .strict();

const compatibilityFactsSchema = z
  .object({
    declaredRange: z.string().trim().min(1).max(200).optional(),
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

export const pluginObservationBaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    observationId: sha256Schema.optional(),
    observedAt: dateTimeSchema,
    identity: observationIdentitySchema,
    source: observationSourceSchema,
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
        installTargets: z
          .array(installTargetSchema)
          .max(100)
          .superRefine((targets, context) => {
            const seen = new Set<string>();
            targets.forEach((target, index) => {
              if (
                /[\u0000-\u0020\u007f]/u.test(target.spec) ||
                target.spec.startsWith("-")
              )
                context.addIssue({
                  code: "custom",
                  path: [index, "spec"],
                  message:
                    "install target spec contains a command-injection structure",
                });
              const key = `${target.kind}\0${target.spec}\0${target.packagePath ?? ""}`;
              if (seen.has(key))
                context.addIssue({
                  code: "custom",
                  path: [index, "spec"],
                  message:
                    "install target kind, spec, and packagePath must be unique",
                });
              seen.add(key);
            });
          })
          .optional(),
        compatibility: compatibilityFactsSchema.optional(),
        metrics: metricFactsSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((observation, context) => {
    if (
      observation.identity.kind === "npm" &&
      observation.facts?.package?.name !== undefined &&
      observation.facts.package.name !== observation.identity.packageName
    )
      context.addIssue({
        code: "custom",
        path: ["facts", "package", "name"],
        message: "package fact name must match the npm identity",
      });
    if (observation.identity.kind === "github") {
      const repository = observation.facts?.repository;
      if (
        repository?.githubId !== undefined &&
        repository.githubId !== observation.identity.repositoryId
      )
        context.addIssue({
          code: "custom",
          path: ["facts", "repository", "githubId"],
          message: "repository fact githubId must match the GitHub identity",
        });
      if (
        repository?.fullName !== undefined &&
        repository.fullName.toLowerCase() !==
          observation.identity.fullName.toLowerCase()
      )
        context.addIssue({
          code: "custom",
          path: ["facts", "repository", "fullName"],
          message: "repository fact fullName must match the GitHub identity",
        });
    }
  });

export type ObservationIdentity = z.infer<typeof observationIdentitySchema>;
export type ObservationSource = z.infer<typeof observationSourceSchema>;
export type PluginObservationV1 = Omit<
  z.infer<typeof pluginObservationBaseSchema>,
  "observationId"
> & { observationId: string };

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function observationIdFor(
  identity: ObservationIdentity,
  source: ObservationSource,
): string {
  return sha256(
    canonicalJson({
      identity,
      source: {
        url: source.url,
        ref: source.ref ?? null,
        fingerprint: source.etag ?? source.contentHash ?? null,
      },
    }),
  );
}

export function parsePluginObservation(raw: unknown): PluginObservationV1 {
  const parsed = pluginObservationBaseSchema.parse(raw);
  const generated = observationIdFor(parsed.identity, parsed.source);
  if (parsed.observationId && parsed.observationId !== generated)
    throw new CliError({
      code: "observation_id_mismatch",
      message:
        "observationId does not match the canonical identity and source fingerprint.",
      retryable: false,
      repairHint:
        "Remove observationId and let the CLI regenerate it from identity and source.",
      path: "observationId",
      details: { expected: generated, received: parsed.observationId },
    });
  return { ...parsed, observationId: generated };
}

export const curationContentSchema = z
  .object({
    displayName: z
      .object({
        zh: z.string().trim().min(1).max(120),
        en: z.string().trim().min(1).max(120),
      })
      .strict(),
    shortDescription: z
      .object({
        zh: z.string().trim().min(1).max(240),
        en: z.string().trim().min(1).max(240),
      })
      .strict(),
    overviewMarkdown: z
      .object({
        zh: z.string().trim().min(1).max(8_000),
        en: z.string().trim().min(1).max(8_000),
      })
      .strict(),
    sourceReadmeHash: sha256Schema.optional(),
    categories: z.array(z.string().trim().min(1).max(64)).max(20),
    tags: z.array(z.string().trim().min(1).max(64)).max(100),
    derivedFrom: z.array(urlSchema).max(100),
  })
  .strict()
  .superRefine((content, context) => {
    for (const field of ["categories", "tags", "derivedFrom"] as const)
      if (new Set(content[field]).size !== content[field].length)
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} must not contain duplicates`,
        });
  });

export const mediaInputSchema = z
  .object({
    kind: z.enum(["icon", "screenshot"]),
    localPath: z.string().trim().min(1),
    sourceUrl: urlSchema.optional(),
    observedAt: dateTimeSchema.optional(),
    sourceSha256: sha256Schema.optional(),
    altText: z.object({
      en: z.string().trim().min(1).max(240),
      zh: z.string().trim().min(1).max(240),
    }),
    caption: z
      .object({
        en: z.string().trim().min(1).max(500),
        zh: z.string().trim().min(1).max(500),
      })
      .strict()
      .optional(),
  })
  .strict();

const dateOrDateTimeSchema = z.union([z.string().date(), dateTimeSchema]);

export const pluginListOptionsSchema = z
  .object({
    state: z
      .array(z.enum(["draft", "published", "hidden"]))
      .max(3)
      .optional(),
    needs: z
      .array(
        z.enum([
          "refresh",
          "content",
          "metadata",
          "source",
          "target",
          "readme",
          "publisher",
        ]),
      )
      .max(7)
      .optional(),
    source: z
      .array(z.enum(["npm", "github"]))
      .max(2)
      .optional(),
    risk: z
      .array(
        z.enum([
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
        ]),
      )
      .max(10)
      .optional(),
    observedBefore: dateOrDateTimeSchema.optional(),
    updatedBefore: dateOrDateTimeSchema.optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().max(1_000).optional(),
    all: z.boolean().optional(),
  })
  .strict();

export const submissionListOptionsSchema = z
  .object({
    status: z
      .array(
        z.enum([
          "queued",
          "discovered",
          "qualified",
          "rejected",
          "published",
          "resolved",
        ]),
      )
      .max(6)
      .optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().max(1_000).optional(),
    all: z.boolean().optional(),
  })
  .strict();

const reportTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(10_000)
  .refine(
    (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
    { message: "report text contains unsupported control characters" },
  );

export const operationReportInputSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    runId: z.string().uuid(),
    startedAt: dateTimeSchema,
    completedAt: dateTimeSchema,
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

export type OperationReportInput = z.infer<typeof operationReportInputSchema>;

export const visibilityInputSchema = z
  .object({
    visibility: z.enum(["hidden", "visible"]),
    reason: z.string().trim().min(3).max(1_000),
  })
  .strict();

export const submissionResolutionInputSchema = z
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
