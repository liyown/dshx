import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;

export const catalogSyncRuns = sqliteTable(
  "catalog_sync_runs",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull().default("github-topic"),
    mode: text("mode", { enum: ["bootstrap", "incremental", "full"] }).notNull(),
    status: text("status", { enum: ["open", "committed", "failed", "aborted"] })
      .notNull()
      .default("open"),
    schemaVersion: integer("schema_version").notNull().default(1),
    cliVersion: text("cli_version"),
    checkerVersion: text("checker_version"),
    actorTokenId: text("actor_token_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    cursorJson: text("cursor_json", { mode: "json" }).$type<Record<string, unknown> | null>(),
    payloadHash: text("payload_hash"),
    expectedItems: integer("expected_items").notNull().default(0),
    receivedItems: integer("received_items").notNull().default(0),
    acceptedItems: integer("accepted_items").notNull().default(0),
    rejectedItems: integer("rejected_items").notNull().default(0),
    errorSummary: text("error_summary"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().default(now),
    committedAt: integer("committed_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("catalog_sync_runs_idempotency_idx").on(table.idempotencyKey),
    index("catalog_sync_runs_status_started_idx").on(table.status, table.startedAt),
  ],
);

export const catalogSyncItems = sqliteTable(
  "catalog_sync_items",
  {
    runId: text("run_id")
      .notNull()
      .references(() => catalogSyncRuns.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    contentHash: text("content_hash").notNull(),
    payloadJson: text("payload_json", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    validationStatus: text("validation_status", { enum: ["accepted", "rejected"] })
      .notNull()
      .default("accepted"),
    validationErrorsJson: text("validation_errors_json", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.itemKey] }),
    index("catalog_sync_items_run_status_idx").on(table.runId, table.validationStatus),
  ],
);

export const publishers = sqliteTable(
  "publishers",
  {
    id: text("id").primaryKey(),
    githubId: text("github_id").notNull(),
    login: text("login").notNull(),
    kind: text("kind", { enum: ["user", "organization"] }).notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    profileUrl: text("profile_url").notNull(),
    bio: text("bio"),
    websiteUrl: text("website_url"),
    trustTier: text("trust_tier", { enum: ["official", "community"] })
      .notNull()
      .default("community"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("publishers_github_id_idx").on(table.githubId),
    uniqueIndex("publishers_login_idx").on(table.login),
  ],
);

export const repositories = sqliteTable(
  "repositories",
  {
    id: text("id").primaryKey(),
    githubId: text("github_id").notNull(),
    nodeId: text("node_id"),
    publisherId: text("publisher_id").references(() => publishers.id, { onDelete: "set null" }),
    ownerLogin: text("owner_login").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    defaultBranch: text("default_branch").notNull(),
    description: text("description"),
    homepageUrl: text("homepage_url"),
    topicsJson: text("topics_json", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    primaryLanguage: text("primary_language"),
    licenseSpdx: text("license_spdx"),
    isFork: integer("is_fork", { mode: "boolean" }).notNull().default(false),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    isDisabled: integer("is_disabled", { mode: "boolean" }).notNull().default(false),
    stars: integer("stars").notNull().default(0),
    forks: integer("forks").notNull().default(0),
    openIssues: integer("open_issues").notNull().default(0),
    candidateStatus: text("candidate_status", {
      enum: ["discovered", "qualified", "rejected", "stale"],
    })
      .notNull()
      .default("discovered"),
    rejectionCodesJson: text("rejection_codes_json", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    etag: text("etag"),
    contentHash: text("content_hash"),
    firstSeenRunId: text("first_seen_run_id").references(() => catalogSyncRuns.id, {
      onDelete: "set null",
    }),
    lastSeenRunId: text("last_seen_run_id").references(() => catalogSyncRuns.id, {
      onDelete: "set null",
    }),
    githubCreatedAt: integer("github_created_at", { mode: "timestamp_ms" }),
    githubUpdatedAt: integer("github_updated_at", { mode: "timestamp_ms" }),
    pushedAt: integer("pushed_at", { mode: "timestamp_ms" }),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull().default(now),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull().default(now),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("repositories_github_id_idx").on(table.githubId),
    uniqueIndex("repositories_full_name_idx").on(table.fullName),
    index("repositories_candidate_status_idx").on(table.candidateStatus),
    index("repositories_pushed_at_idx").on(table.pushedAt),
  ],
);

export const repositoryPackages = sqliteTable(
  "repository_packages",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    subdirectory: text("subdirectory").notNull().default(""),
    packageName: text("package_name").notNull(),
    packageVersion: text("package_version"),
    packageJsonSha: text("package_json_sha").notNull(),
    patchPath: text("patch_path").notNull(),
    patchSha: text("patch_sha"),
    npmPackageName: text("npm_package_name"),
    npmRegistryUrl: text("npm_registry_url"),
    installKind: text("install_kind", { enum: ["npm", "github"] }).notNull(),
    installSpec: text("install_spec").notNull(),
    dshBundle: integer("dsh_bundle", { mode: "boolean" }).notNull().default(false),
    dshxDetected: integer("dshx_detected", { mode: "boolean" }).notNull().default(false),
    qualificationStatus: text("qualification_status", {
      enum: ["candidate", "verified", "rejected", "unavailable"],
    })
      .notNull()
      .default("candidate"),
    validationSummaryJson: text("validation_summary_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("repository_packages_location_idx").on(table.repositoryId, table.subdirectory),
    index("repository_packages_package_name_idx").on(table.packageName),
    index("repository_packages_status_idx").on(table.qualificationStatus),
  ],
);

export const verificationChecks = sqliteTable(
  "verification_checks",
  {
    id: text("id").primaryKey(),
    repositoryPackageId: text("repository_package_id")
      .notNull()
      .references(() => repositoryPackages.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => catalogSyncRuns.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    status: text("status", { enum: ["pass", "fail", "warn"] }).notNull(),
    observedJson: text("observed_json", { mode: "json" }).$type<Record<string, unknown> | null>(),
    evidenceUrl: text("evidence_url"),
    evidenceSha: text("evidence_sha"),
    checkerVersion: text("checker_version").notNull(),
    checkedAt: integer("checked_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("verification_checks_run_code_idx").on(
      table.repositoryPackageId,
      table.runId,
      table.code,
    ),
    index("verification_checks_status_idx").on(table.status),
  ],
);

// The legacy projection columns remain intentionally: list pages can read one
// indexed row while normalized tables retain provenance, translations, and history.
export const plugins = sqliteTable(
  "plugins",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    identityKey: text("identity_key").notNull(),
    packageName: text("package_name").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    authorHandle: text("author_handle").notNull(),
    category: text("category").notNull(),
    badge: text("badge", { enum: ["official", "community"] })
      .notNull()
      .default("community"),
    latestVersion: text("latest_version").notNull(),
    compatibilityRange: text("compatibility_range").notNull(),
    publisherId: text("publisher_id").references(() => publishers.id, { onDelete: "set null" }),
    primaryRepositoryId: text("primary_repository_id").references(() => repositories.id, {
      onDelete: "set null",
    }),
    primaryRepositoryPackageId: text("primary_repository_package_id").references(
      () => repositoryPackages.id,
      { onDelete: "set null" },
    ),
    activeSyncRunId: text("active_sync_run_id").references(() => catalogSyncRuns.id, {
      onDelete: "set null",
    }),
    verificationStatus: text("verification_status", {
      enum: ["pending", "verified", "failed"],
    })
      .notNull()
      .default("pending"),
    trustTier: text("trust_tier", { enum: ["official", "community"] })
      .notNull()
      .default("community"),
    lifecycleStatus: text("lifecycle_status", {
      enum: ["active", "unmaintained", "unavailable", "suspended"],
    })
      .notNull()
      .default("active"),
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    licenseSpdx: text("license_spdx"),
    homepageUrl: text("homepage_url"),
    repositoryUrl: text("repository_url"),
    dshxDetected: integer("dshx_detected", { mode: "boolean" }).notNull().default(false),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    firstPublishedAt: integer("first_published_at", { mode: "timestamp_ms" }),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    unavailableAt: integer("unavailable_at", { mode: "timestamp_ms" }),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("plugins_identity_key_idx").on(table.identityKey),
    index("plugins_publication_idx").on(table.status, table.lifecycleStatus),
    index("plugins_category_idx").on(table.category),
    index("plugins_author_handle_idx").on(table.authorHandle),
    index("plugins_updated_idx").on(table.updatedAt),
  ],
);

export const pluginAliases = sqliteTable(
  "plugin_aliases",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["slug", "package", "install"] }).notNull(),
    value: text("value").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [uniqueIndex("plugin_aliases_kind_value_idx").on(table.kind, table.value)],
);

export const pluginInstallTargets = sqliteTable(
  "plugin_install_targets",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    repositoryPackageId: text("repository_package_id").references(() => repositoryPackages.id, {
      onDelete: "set null",
    }),
    kind: text("kind", { enum: ["npm", "github"] }).notNull(),
    spec: text("spec").notNull(),
    packagePath: text("package_path").notNull().default(""),
    packageName: text("package_name").notNull(),
    version: text("version").notNull(),
    integrity: text("integrity"),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: ["active", "unavailable"] })
      .notNull()
      .default("active"),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("plugin_install_targets_location_idx").on(
      table.kind,
      table.spec,
      table.packagePath,
    ),
    index("plugin_install_targets_plugin_primary_idx").on(table.pluginId, table.isPrimary),
  ],
);

export const pluginReleases = sqliteTable(
  "plugin_releases",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    channel: text("channel", { enum: ["stable", "prerelease"] })
      .notNull()
      .default("stable"),
    gitTag: text("git_tag"),
    commitSha: text("commit_sha"),
    compatibilityRange: text("compatibility_range"),
    compatibilitySource: text("compatibility_source", {
      enum: ["manifest", "peer-dependency", "inferred", "unknown"],
    })
      .notNull()
      .default("unknown"),
    releaseNotesUrl: text("release_notes_url"),
    deprecated: integer("deprecated", { mode: "boolean" }).notNull().default(false),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("plugin_releases_version_idx").on(table.pluginId, table.version),
    index("plugin_releases_published_idx").on(table.pluginId, table.publishedAt),
  ],
);

export const pluginDependencies = sqliteTable(
  "plugin_dependencies",
  {
    releaseId: text("release_id")
      .notNull()
      .references(() => pluginReleases.id, { onDelete: "cascade" }),
    packageName: text("package_name").notNull(),
    versionRange: text("version_range").notNull(),
    kind: text("kind", { enum: ["runtime", "peer", "optional"] }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.releaseId, table.packageName, table.kind] })],
);

export const pluginLinks = sqliteTable(
  "plugin_links",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["homepage", "repository", "docs", "issues", "funding", "npm"],
    }).notNull(),
    url: text("url").notNull(),
    label: text("label"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [uniqueIndex("plugin_links_kind_url_idx").on(table.pluginId, table.kind, table.url)],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [uniqueIndex("categories_slug_idx").on(table.slug)],
);

export const categoryLocalizations = sqliteTable(
  "category_localizations",
  {
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    locale: text("locale", { enum: ["en", "zh"] }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
  },
  (table) => [primaryKey({ columns: [table.categoryId, table.locale] })],
);

export const pluginCategories = sqliteTable(
  "plugin_categories",
  {
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.pluginId, table.categoryId] }),
    index("plugin_categories_category_idx").on(table.categoryId, table.isPrimary),
  ],
);

export const pluginCapabilities = sqliteTable(
  "plugin_capabilities",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["tool", "service", "ui", "agent", "memory", "model", "integration"],
    }).notNull(),
    identifier: text("identifier").notNull(),
    observed: integer("observed", { mode: "boolean" }).notNull().default(true),
    metadataJson: text("metadata_json", { mode: "json" }).$type<Record<string, unknown> | null>(),
  },
  (table) => [
    uniqueIndex("plugin_capabilities_identifier_idx").on(
      table.pluginId,
      table.kind,
      table.identifier,
    ),
  ],
);

export const pluginLocalizations = sqliteTable(
  "plugin_localizations",
  {
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    locale: text("locale", { enum: ["en", "zh"] }).notNull(),
    displayName: text("display_name").notNull(),
    shortDescription: text("short_description").notNull(),
    overviewMarkdown: text("overview_markdown").notNull(),
    highlightsJson: text("highlights_json", { mode: "json" }).$type<string[]>().notNull(),
    installNotesMarkdown: text("install_notes_markdown"),
    seoTitle: text("seo_title").notNull(),
    seoDescription: text("seo_description").notNull(),
    sourceLocale: text("source_locale", { enum: ["en", "zh"] }).notNull(),
    sourceContentHash: text("source_content_hash").notNull(),
    translationStatus: text("translation_status", {
      enum: ["pending", "ready", "stale", "rejected"],
    })
      .notNull()
      .default("pending"),
    translator: text("translator", { enum: ["upstream", "agent", "manual"] }).notNull(),
    translatedAt: integer("translated_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.pluginId, table.locale] }),
    index("plugin_localizations_locale_status_idx").on(table.locale, table.translationStatus),
  ],
);

export const pluginMedia = sqliteTable(
  "plugin_media",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["icon", "screenshot"] }).notNull(),
    r2Key: text("r2_key").notNull(),
    sourceUrl: text("source_url"),
    sha256: text("sha256").notNull(),
    contentType: text("content_type").notNull(),
    width: integer("width"),
    height: integer("height"),
    byteSize: integer("byte_size").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status", { enum: ["active", "removed"] })
      .notNull()
      .default("active"),
    observedAt: integer("observed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    // Added to this legacy table with SQLite's required constant ALTER default.
    // Ops v1 always writes the real timestamp explicitly.
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`0`),
  },
  (table) => [
    index("plugin_media_hash_idx").on(table.sha256),
    uniqueIndex("plugin_media_plugin_kind_hash_idx").on(table.pluginId, table.kind, table.sha256),
    index("plugin_media_plugin_kind_idx").on(table.pluginId, table.kind, table.sortOrder),
  ],
);

export const pluginMediaLocalizations = sqliteTable(
  "plugin_media_localizations",
  {
    mediaId: text("media_id")
      .notNull()
      .references(() => pluginMedia.id, { onDelete: "cascade" }),
    locale: text("locale", { enum: ["en", "zh"] }).notNull(),
    altText: text("alt_text").notNull(),
    caption: text("caption"),
  },
  (table) => [primaryKey({ columns: [table.mediaId, table.locale] })],
);

export const pluginMetricsCurrent = sqliteTable(
  "plugin_metrics_current",
  {
    pluginId: text("plugin_id")
      .primaryKey()
      .references(() => plugins.id, { onDelete: "cascade" }),
    githubStars: integer("github_stars").notNull().default(0),
    githubForks: integer("github_forks").notNull().default(0),
    githubOpenIssues: integer("github_open_issues").notNull().default(0),
    npmDownloadsDay: integer("npm_downloads_day"),
    npmDownloadsWeek: integer("npm_downloads_week"),
    trendScore7d: integer("trend_score_7d").notNull().default(0),
    trendScore30d: integer("trend_score_30d").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    ratingSum: integer("rating_sum").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [index("plugin_metrics_trending_idx").on(table.trendScore7d, table.githubStars)],
);

export const pluginMetricDaily = sqliteTable(
  "plugin_metric_daily",
  {
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    snapshotDate: text("snapshot_date").notNull(),
    githubStars: integer("github_stars").notNull().default(0),
    githubForks: integer("github_forks").notNull().default(0),
    githubOpenIssues: integer("github_open_issues").notNull().default(0),
    npmDownloadsDay: integer("npm_downloads_day"),
    npmDownloadsWeek: integer("npm_downloads_week"),
    trendScore7d: integer("trend_score_7d").notNull().default(0),
    trendScore30d: integer("trend_score_30d").notNull().default(0),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.pluginId, table.snapshotDate] }),
    index("plugin_metric_daily_date_idx").on(table.snapshotDate),
  ],
);

// Better Auth tables. Keep these names aligned with the adapter configuration.
export const authUsers = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    githubId: text("github_id"),
    githubLogin: text("github_login"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("user_email_idx").on(table.email),
    uniqueIndex("user_github_id_idx").on(table.githubId),
    uniqueIndex("user_github_login_idx").on(table.githubLogin),
  ],
);

export const authSessions = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("session_token_idx").on(table.token),
    index("session_user_idx").on(table.userId),
  ],
);

export const authAccounts = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    issuer: text("issuer").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("account_issuer_idx").on(table.issuer, table.accountId),
    index("account_user_idx").on(table.userId),
  ],
);

export const authVerifications = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userProfiles = sqliteTable(
  "user_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    githubId: text("github_id").notNull(),
    githubLogin: text("github_login").notNull(),
    role: text("role", { enum: ["member", "operator", "moderator", "admin"] })
      .notNull()
      .default("member"),
    status: text("status", { enum: ["active", "restricted", "banned"] })
      .notNull()
      .default("active"),
    preferredLocale: text("preferred_locale", { enum: ["en", "zh"] })
      .notNull()
      .default("en"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    anonymizedAt: integer("anonymized_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("user_profiles_github_id_idx").on(table.githubId),
    uniqueIndex("user_profiles_github_login_idx").on(table.githubLogin),
  ],
);

export const cliAuthorizations = sqliteTable(
  "cli_authorizations",
  {
    id: text("id").primaryKey(),
    stateHash: text("state_hash").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    callbackUrl: text("callback_url").notNull(),
    requestedScopesJson: text("requested_scopes_json", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    status: text("status", { enum: ["pending", "approved", "consumed", "expired", "denied"] })
      .notNull()
      .default("pending"),
    approvedByUserId: text("approved_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    exchangeCodeHash: text("exchange_code_hash"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("cli_authorizations_state_idx").on(table.stateHash),
    index("cli_authorizations_status_expires_idx").on(table.status, table.expiresAt),
  ],
);

export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopesJson: text("scopes_json", { mode: "json" }).$type<string[]>().notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("api_tokens_hash_idx").on(table.tokenHash),
    index("api_tokens_user_idx").on(table.userId, table.revokedAt),
  ],
);

// Operations v1 keeps external observations immutable-by-identity and builds a
// current operational projection beside the public catalog projection. The
// legacy catalog sync tables above remain readable migration history only.
export const pluginObservationIdentities = sqliteTable(
  "plugin_observation_identities",
  {
    identityKey: text("identity_key").primaryKey(),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["npm", "github"] }).notNull(),
    identityJson: text("identity_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    lastObservedAt: integer("last_observed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [index("plugin_observation_identities_plugin_idx").on(table.pluginId)],
);

export const pluginObservations = sqliteTable(
  "plugin_observations",
  {
    observationId: text("observation_id").primaryKey(),
    schemaVersion: integer("schema_version").notNull(),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    identityKey: text("identity_key").notNull(),
    observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
    sourceKind: text("source_kind", {
      enum: ["npm", "github", "readme", "release", "manual"],
    }).notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceRef: text("source_ref"),
    sourceEtag: text("source_etag"),
    sourceContentHash: text("source_content_hash"),
    sourceAvailability: text("source_availability", {
      enum: ["available", "unavailable"],
    }).notNull(),
    payloadHash: text("payload_hash").notNull(),
    payloadJson: text("payload_json", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    actorTokenId: text("actor_token_id").references(() => apiTokens.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    index("plugin_observations_plugin_observed_idx").on(table.pluginId, table.observedAt),
    index("plugin_observations_identity_observed_idx").on(table.identityKey, table.observedAt),
    index("plugin_observations_source_observed_idx").on(table.sourceUrl, table.observedAt),
  ],
);

export const pluginOperationalState = sqliteTable(
  "plugin_operational_state",
  {
    pluginId: text("plugin_id")
      .primaryKey()
      .references(() => plugins.id, { onDelete: "cascade" }),
    state: text("state", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    visibility: text("visibility", { enum: ["visible", "hidden"] })
      .notNull()
      .default("visible"),
    revision: integer("revision").notNull().default(1),
    // A write nonce lets dependent projection statements prove that their
    // optimistic state transition won before they mutate public tables.
    lastOperationId: text("last_operation_id"),
    detectionJson: text("detection_json", { mode: "json" }).$type<Record<string, unknown> | null>(),
    factsJson: text("facts_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    sourcesJson: text("sources_json", { mode: "json" })
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default(sql`'[]'`),
    fieldProvenanceJson: text("field_provenance_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    visibilityReason: text("visibility_reason"),
    visibilityChangedAt: integer("visibility_changed_at", { mode: "timestamp_ms" }),
    lastObservedAt: integer("last_observed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    index("plugin_operational_state_state_idx").on(table.state, table.visibility),
    index("plugin_operational_state_observed_idx").on(table.lastObservedAt),
    index("plugin_operational_state_updated_idx").on(table.updatedAt),
  ],
);

export const pluginCurations = sqliteTable("plugin_curations", {
  pluginId: text("plugin_id")
    .primaryKey()
    .references(() => plugins.id, { onDelete: "cascade" }),
  displayNameJson: text("display_name_json", { mode: "json" })
    .$type<Record<"en" | "zh", string>>()
    .notNull(),
  shortDescriptionJson: text("short_description_json", { mode: "json" })
    .$type<Record<"en" | "zh", string>>()
    .notNull(),
  overviewMarkdownJson: text("overview_markdown_json", { mode: "json" })
    .$type<Record<"en" | "zh", string>>()
    .notNull(),
  sourceReadmeHash: text("source_readme_hash"),
  categoriesJson: text("categories_json", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  tagsJson: text("tags_json", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  derivedFromJson: text("derived_from_json", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const pluginSourceDocuments = sqliteTable(
  "plugin_source_documents",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["readme"] }).notNull(),
    availability: text("availability", { enum: ["available", "unavailable"] }).notNull(),
    format: text("format", { enum: ["markdown"] }).notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceRef: text("source_ref"),
    sourcePath: text("source_path"),
    content: text("content"),
    contentHash: text("content_hash"),
    observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("plugin_source_documents_plugin_kind_idx").on(table.pluginId, table.kind),
    index("plugin_source_documents_hash_idx").on(table.contentHash),
  ],
);

export const pluginOperationAudit = sqliteTable(
  "plugin_operation_audit",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    // Audit actor/resource identifiers intentionally have no foreign keys: the
    // append-only ledger must survive token revocation and resource deletion.
    actorTokenId: text("actor_token_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type", {
      enum: ["plugin", "observation", "submission", "media"],
    }).notNull(),
    resourceId: text("resource_id").notNull(),
    pluginId: text("plugin_id"),
    beforeRevision: integer("before_revision"),
    afterRevision: integer("after_revision"),
    detailsJson: text("details_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    index("plugin_operation_audit_plugin_idx").on(table.pluginId, table.createdAt),
    index("plugin_operation_audit_resource_idx").on(
      table.resourceType,
      table.resourceId,
      table.createdAt,
    ),
    index("plugin_operation_audit_request_idx").on(table.requestId),
  ],
);

export const hubOperationReports = sqliteTable(
  "hub_operation_reports",
  {
    runId: text("run_id").primaryKey(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
    outcome: text("outcome", { enum: ["completed", "partial"] }).notNull(),
    bodyEn: text("body_en").notNull(),
    bodyZh: text("body_zh").notNull(),
    payloadHash: text("payload_hash").notNull(),
    actorTokenId: text("actor_token_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [index("hub_operation_reports_completed_idx").on(table.completedAt, table.runId)],
);

export const pluginClaims = sqliteTable(
  "plugin_claims",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    challengeTokenHash: text("challenge_token_hash").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    challengePath: text("challenge_path").notNull().default(".github/dshx-hub-claim.json"),
    status: text("status", { enum: ["pending", "verified", "expired", "revoked"] })
      .notNull()
      .default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("plugin_claims_status_idx").on(table.pluginId, table.status),
    uniqueIndex("plugin_claims_idempotency_idx").on(table.userId, table.idempotencyKey),
  ],
);

export const pluginMaintainers = sqliteTable(
  "plugin_maintainers",
  {
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "maintainer"] })
      .notNull()
      .default("maintainer"),
    source: text("source", { enum: ["claim", "manual"] }).notNull(),
    claimId: text("claim_id").references(() => pluginClaims.id, { onDelete: "set null" }),
    addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull().default(now),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [primaryKey({ columns: [table.pluginId, table.userId] })],
);

export const pluginReviews = sqliteTable(
  "plugin_reviews",
  {
    id: text("id").primaryKey(),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    locale: text("locale", { enum: ["en", "zh"] }).notNull(),
    body: text("body"),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", { enum: ["published", "hidden", "deleted"] })
      .notNull()
      .default("published"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("plugin_reviews_user_plugin_idx").on(table.pluginId, table.userId),
    uniqueIndex("plugin_reviews_idempotency_idx").on(table.userId, table.idempotencyKey),
    index("plugin_reviews_plugin_status_idx").on(table.pluginId, table.status, table.createdAt),
    check("plugin_reviews_rating_check", sql`${table.rating} between 1 and 5`),
  ],
);

export const reviewReplies = sqliteTable(
  "review_replies",
  {
    id: text("id").primaryKey(),
    reviewId: text("review_id")
      .notNull()
      .references(() => pluginReviews.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    locale: text("locale", { enum: ["en", "zh"] }).notNull(),
    body: text("body").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", { enum: ["published", "hidden", "deleted"] })
      .notNull()
      .default("published"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("review_replies_review_idx").on(table.reviewId, table.status, table.createdAt),
    uniqueIndex("review_replies_idempotency_idx").on(table.userId, table.idempotencyKey),
  ],
);

export const contentReports = sqliteTable(
  "content_reports",
  {
    id: text("id").primaryKey(),
    reporterUserId: text("reporter_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    targetType: text("target_type", {
      enum: ["plugin", "review", "reply", "profile", "collection"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason", { enum: ["spam", "abuse", "misinformation", "other"] }).notNull(),
    details: text("details"),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status", { enum: ["open", "resolved", "dismissed"] })
      .notNull()
      .default("open"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("content_reports_unique_target_idx").on(
      table.reporterUserId,
      table.targetType,
      table.targetId,
    ),
    uniqueIndex("content_reports_idempotency_idx").on(table.reporterUserId, table.idempotencyKey),
    index("content_reports_status_idx").on(table.status, table.createdAt),
  ],
);

export const communityRateLimits = sqliteTable(
  "community_rate_limits",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
    action: text("action").notNull(),
    requestCount: integer("request_count").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.userId, table.windowStart, table.action] })],
);

export const moderationActions = sqliteTable(
  "moderation_actions",
  {
    id: text("id").primaryKey(),
    actorType: text("actor_type", { enum: ["user", "api_token", "system"] }).notNull(),
    actorId: text("actor_id"),
    action: text("action", {
      enum: ["hide", "restore", "dismiss", "restrict", "unrestrict", "ban", "unban"],
    }).notNull(),
    targetType: text("target_type", {
      enum: ["plugin", "review", "reply", "profile", "collection", "user"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    metadataJson: text("metadata_json", { mode: "json" }).$type<Record<string, unknown> | null>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    index("moderation_actions_target_idx").on(table.targetType, table.targetId, table.createdAt),
  ],
);

export const userRestrictions = sqliteTable(
  "user_restrictions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["write", "ban"] }).notNull(),
    reason: text("reason").notNull(),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull().default(now),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdByActorType: text("created_by_actor_type", {
      enum: ["user", "api_token", "system"],
    }).notNull(),
    createdByActorId: text("created_by_actor_id"),
  },
  (table) => [
    index("user_restrictions_active_idx").on(table.userId, table.revokedAt, table.expiresAt),
  ],
);

export const userAliases = sqliteTable(
  "user_aliases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    githubLogin: text("github_login").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [uniqueIndex("user_aliases_login_idx").on(table.githubLogin)],
);

export const publisherAliases = sqliteTable(
  "publisher_aliases",
  {
    id: text("id").primaryKey(),
    publisherId: text("publisher_id")
      .notNull()
      .references(() => publishers.id, { onDelete: "cascade" }),
    login: text("login").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [uniqueIndex("publisher_aliases_login_idx").on(table.login)],
);

export const publisherLocalizations = sqliteTable(
  "publisher_localizations",
  {
    publisherId: text("publisher_id")
      .notNull()
      .references(() => publishers.id, { onDelete: "cascade" }),
    locale: text("locale", { enum: ["en", "zh"] }).notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    seoTitle: text("seo_title").notNull(),
    seoDescription: text("seo_description").notNull(),
    sourceContentHash: text("source_content_hash").notNull(),
    status: text("status", { enum: ["pending", "ready", "stale", "rejected"] })
      .notNull()
      .default("pending"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [primaryKey({ columns: [table.publisherId, table.locale] })],
);

export const pluginBookmarks = sqliteTable(
  "plugin_bookmarks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.pluginId] }),
    index("plugin_bookmarks_plugin_idx").on(table.pluginId, table.createdAt),
  ],
);

export const pluginFollows = sqliteTable(
  "plugin_follows",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.pluginId] }),
    index("plugin_follows_plugin_idx").on(table.pluginId, table.createdAt),
  ],
);

export const publisherFollows = sqliteTable(
  "publisher_follows",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    publisherId: text("publisher_id")
      .notNull()
      .references(() => publishers.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.publisherId] }),
    index("publisher_follows_publisher_idx").on(table.publisherId, table.createdAt),
  ],
);

export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    visibility: text("visibility", { enum: ["public", "private"] })
      .notNull()
      .default("public"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("collections_owner_slug_idx").on(table.userId, table.slug),
    index("collections_visibility_idx").on(table.visibility, table.updatedAt),
  ],
);

export const collectionPlugins = sqliteTable(
  "collection_plugins",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.pluginId] }),
    index("collection_plugins_order_idx").on(table.collectionId, table.sortOrder, table.addedAt),
  ],
);

export const notificationEvents = sqliteTable(
  "notification_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    actorUserId: text("actor_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    payloadJson: text("payload_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [index("notification_events_user_idx").on(table.userId, table.createdAt)],
);

export const notificationReads = sqliteTable(
  "notification_reads",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    notificationId: text("notification_id")
      .notNull()
      .references(() => notificationEvents.id, { onDelete: "cascade" }),
    readAt: integer("read_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [primaryKey({ columns: [table.userId, table.notificationId] })],
);

export const pluginSubmissions = sqliteTable(
  "plugin_submissions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => authUsers.id, { onDelete: "cascade" }),
    submitterKey: text("submitter_key").notNull(),
    repositoryUrl: text("repository_url").notNull(),
    repositoryFullName: text("repository_full_name").notNull(),
    status: text("status", {
      enum: ["queued", "discovered", "qualified", "rejected", "published", "resolved"],
    })
      .notNull()
      .default("queued"),
    idempotencyKey: text("idempotency_key").notNull(),
    sourceHash: text("source_hash"),
    catalogRunId: text("catalog_run_id").references(() => catalogSyncRuns.id, {
      onDelete: "set null",
    }),
    resolutionJson: text("resolution_json", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("plugin_submissions_submitter_idempotency_idx").on(
      table.submitterKey,
      table.idempotencyKey,
    ),
    index("plugin_submissions_status_idx").on(table.status, table.createdAt),
  ],
);

export const moderationAppeals = sqliteTable(
  "moderation_appeals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    moderationActionId: text("moderation_action_id")
      .notNull()
      .references(() => moderationActions.id, { onDelete: "restrict" }),
    statement: text("statement").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected", "withdrawn"] })
      .notNull()
      .default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    approvalRequestId: text("approval_request_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("moderation_appeals_user_idempotency_idx").on(table.userId, table.idempotencyKey),
    index("moderation_appeals_status_idx").on(table.status, table.createdAt),
  ],
);

export const userBlocks = sqliteTable(
  "user_blocks",
  {
    blockerUserId: text("blocker_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    blockedUserId: text("blocked_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    primaryKey({ columns: [table.blockerUserId, table.blockedUserId] }),
    check("user_blocks_not_self_check", sql`${table.blockerUserId} <> ${table.blockedUserId}`),
  ],
);

export const approvalRequests = sqliteTable(
  "approval_requests",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    risk: text("risk", { enum: ["high", "critical"] }).notNull(),
    status: text("status", {
      enum: [
        "pending",
        "changes_requested",
        "approved",
        "rejected",
        "cancelled",
        "expired",
        "superseded",
      ],
    })
      .notNull()
      .default("pending"),
    requesterType: text("requester_type", { enum: ["user", "api_token", "system"] }).notNull(),
    requesterId: text("requester_id"),
    requesterTokenId: text("requester_token_id").references(() => apiTokens.id, {
      onDelete: "set null",
    }),
    runId: text("run_id").references(() => catalogSyncRuns.id, { onDelete: "set null" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    executionMode: text("execution_mode", { enum: ["server", "agent"] }).notNull(),
    effectKind: text("effect_kind").notNull(),
    effectStatus: text("effect_status", {
      enum: ["pending", "awaiting_agent", "running", "succeeded", "failed", "superseded"],
    })
      .notNull()
      .default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    decidedByUserId: text("decided_by_user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [
    uniqueIndex("approval_requests_idempotency_idx").on(table.idempotencyKey),
    index("approval_requests_queue_idx").on(table.status, table.risk, table.createdAt),
    index("approval_requests_requester_idx").on(table.requesterTokenId, table.createdAt),
    index("approval_requests_subject_idx").on(table.subjectType, table.subjectId),
  ],
);

export const approvalRequestVersions = sqliteTable(
  "approval_request_versions",
  {
    requestId: text("request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    evidenceJson: text("evidence_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    effectInputJson: text("effect_input_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    preconditionsJson: text("preconditions_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    sourceHash: text("source_hash").notNull(),
    policyVersion: text("policy_version").notNull(),
    createdByType: text("created_by_type", { enum: ["user", "api_token", "system"] }).notNull(),
    createdById: text("created_by_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [primaryKey({ columns: [table.requestId, table.version] })],
);

export const approvalDecisions = sqliteTable(
  "approval_decisions",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    action: text("action", { enum: ["approve", "reject", "request_changes"] }).notNull(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "restrict" }),
    reason: text("reason"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [index("approval_decisions_request_idx").on(table.requestId, table.createdAt)],
);

export const approvalEvents = sqliteTable(
  "approval_events",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    actorType: text("actor_type", { enum: ["user", "api_token", "system"] }).notNull(),
    actorId: text("actor_id"),
    payloadJson: text("payload_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (table) => [index("approval_events_request_idx").on(table.requestId, table.createdAt)],
);

export const approvalEffects = sqliteTable("approval_effects", {
  requestId: text("request_id")
    .primaryKey()
    .references(() => approvalRequests.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  effectKind: text("effect_kind").notNull(),
  executionMode: text("execution_mode", { enum: ["server", "agent"] }).notNull(),
  status: text("status", {
    enum: ["pending", "awaiting_agent", "running", "succeeded", "failed", "superseded"],
  })
    .notNull()
    .default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  leaseTokenHash: text("lease_token_hash"),
  leasedToTokenId: text("leased_to_token_id").references(() => apiTokens.id, {
    onDelete: "set null",
  }),
  leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
});

export const approvalEffectAttempts = sqliteTable(
  "approval_effect_attempts",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    attempt: integer("attempt").notNull(),
    executorType: text("executor_type", { enum: ["server", "api_token"] }).notNull(),
    executorId: text("executor_id"),
    status: text("status", { enum: ["succeeded", "failed", "superseded"] }).notNull(),
    inputHash: text("input_hash").notNull(),
    outputJson: text("output_json", { mode: "json" }).$type<Record<string, unknown> | null>(),
    error: text("error"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("approval_effect_attempts_number_idx").on(table.requestId, table.attempt),
    index("approval_effect_attempts_request_idx").on(table.requestId, table.finishedAt),
  ],
);

export type PluginRecord = typeof plugins.$inferSelect;
export type NewPluginRecord = typeof plugins.$inferInsert;
export type CatalogSyncRunRecord = typeof catalogSyncRuns.$inferSelect;
export type ApiTokenRecord = typeof apiTokens.$inferSelect;
