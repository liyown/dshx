/**
 * The rows an observation projects onto the catalog.
 *
 * One observation becomes `plugins`, `publishers`, `repositories`,
 * `plugin_source_documents`, `plugin_metrics_current` and
 * `plugin_install_targets` rows. Each table has one builder below, so a change
 * to how a README is stored cannot disturb how install targets are matched.
 *
 * Every statement is gated on the caller's `operationId` through
 * `plugin_operational_state`: a projection built for revision N cannot land on
 * revision N+1. The builders only decide which rows to write — `ingest.server`
 * owns the transaction.
 */

import type { BatchItem } from "drizzle-orm/batch";
import { validRange } from "semver";

import type { Database } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";

import { digest } from "../../digest";
import { jsonRecord, type JsonRecord } from "../../json";
import { OperationHttpError } from "../../operations-v1.http";
import { installTargetProvenancePath, type FieldProvenance } from "./merge";

/** What every builder needs to gate its statements on the same write. */
type ProjectionContext = {
  binding: Database;
  pluginId: string;
  operationId: string;
  observedAt: number;
};

/**
 * The statements that put one merged observation into the tables the catalog
 * reads, in the order they must run: publisher, plugin, repository, README,
 * metrics, install targets.
 */
export async function projectionStatements(
  binding: Database,
  pluginId: string,
  facts: JsonRecord,
  provenance: Record<string, FieldProvenance>,
  observedAt: number,
  operationId: string,
  fallbackPackageName: string,
  fallbackVersion: string,
): Promise<BatchItem<"sqlite">[]> {
  const context: ProjectionContext = { binding, pluginId, operationId, observedAt };
  const packageFacts = jsonRecord(facts["package"]);
  const repositoryFacts = jsonRecord(facts["repository"]);
  const compatibility = jsonRecord(facts["compatibility"]);
  const packageName = typeof packageFacts["name"] === "string" ? packageFacts["name"] : null;
  await assertPackageNameAvailable(binding, pluginId, packageName);
  const publisher = await publisherProjection(context, jsonRecord(facts["publisher"]));
  return [
    ...publisher.statements,
    ...packageProjection(context, {
      packageFacts,
      repositoryFacts,
      compatibility,
      packageName,
      publisherId: publisher.publisherId,
      publisherLogin: publisher.publisherLogin,
    }),
    ...repositoryProjection(context, repositoryFacts, publisher.publisherId),
    ...readmeProjection(context, jsonRecord(facts["readme"]), provenance),
    ...metricsProjection(context, jsonRecord(facts["metrics"])),
    ...(await installTargetProjection(context, {
      facts,
      packageFacts,
      packageName,
      fallbackPackageName,
      fallbackVersion,
      provenance,
    })),
  ];
}

/** A package name identifies one plugin; a second owner is a conflict, not an update. */
async function assertPackageNameAvailable(
  binding: Database,
  pluginId: string,
  packageName: string | null,
) {
  if (packageName) {
    const conflict = await binding.get<{ id: string }>(
      parameterizedSql("select id from plugins where package_name=? and id<>? limit 1", [
        packageName,
        pluginId,
      ]),
    );
    if (conflict)
      throw new OperationHttpError(
        409,
        "observation_identity_conflict",
        "Package name belongs to a different plugin",
        false,
        { details: { pluginId, conflictingPluginId: conflict.id, packageName } },
      );
  }
}

/** The GitHub account behind the plugin, created or refreshed when the facts are complete. */
async function publisherProjection(
  context: ProjectionContext,
  publisherFacts: JsonRecord,
): Promise<{
  publisherId: string | null;
  publisherLogin: string | null;
  statements: BatchItem<"sqlite">[];
}> {
  const { binding, pluginId, operationId } = context;
  const statements: BatchItem<"sqlite">[] = [];
  const publisherGithubId =
    typeof publisherFacts["githubId"] === "string" ? publisherFacts["githubId"] : null;
  const publisherLogin =
    typeof publisherFacts["login"] === "string" ? publisherFacts["login"] : null;
  const publisherKind =
    publisherFacts["kind"] === "user" || publisherFacts["kind"] === "organization"
      ? publisherFacts["kind"]
      : null;
  const publisherAvatarUrl =
    typeof publisherFacts["avatarUrl"] === "string" ? publisherFacts["avatarUrl"] : null;
  const publisherProfileUrl =
    typeof publisherFacts["profileUrl"] === "string" ? publisherFacts["profileUrl"] : null;
  let publisherId: string | null = null;
  if (
    publisherGithubId &&
    publisherLogin &&
    publisherKind &&
    publisherAvatarUrl &&
    publisherProfileUrl
  ) {
    const publisherMatches = await binding.all<{ id: string; github_id: string; login: string }>(
      parameterizedSql(
        "select id,github_id,login from publishers where github_id=? or lower(login)=lower(?)",
        [publisherGithubId, publisherLogin],
      ),
    );
    const distinctMatches = [...new Map(publisherMatches.map((row) => [row.id, row])).values()];
    if (
      distinctMatches.length > 1 ||
      (distinctMatches[0] && distinctMatches[0].github_id !== publisherGithubId)
    )
      throw new OperationHttpError(
        409,
        "observation_identity_conflict",
        "Publisher identity conflicts with an existing GitHub account",
        false,
        { details: { pluginId, githubId: publisherGithubId, login: publisherLogin } },
      );
    publisherId = distinctMatches[0]?.id ?? `publisher:${publisherGithubId}`;
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into publishers(
            id,github_id,login,kind,avatar_url,profile_url,trust_tier,created_at,updated_at
          ) select ?,?,?,?,?,?,'community',?,? from plugin_operational_state
            where plugin_id=? and last_operation_id=?
          on conflict(github_id) do update set
            login=excluded.login,kind=excluded.kind,avatar_url=excluded.avatar_url,
            profile_url=excluded.profile_url,updated_at=excluded.updated_at`,
          [
            publisherId,
            publisherGithubId,
            publisherLogin,
            publisherKind,
            publisherAvatarUrl,
            publisherProfileUrl,
            Date.now(),
            Date.now(),
            pluginId,
            operationId,
          ],
        ),
      ),
    );
  }
  return { publisherId, publisherLogin, statements };
}

/** The `plugins` row the catalog lists, taken only from fields this observation knows. */
function packageProjection(
  context: ProjectionContext,
  input: {
    packageFacts: JsonRecord;
    repositoryFacts: JsonRecord;
    compatibility: JsonRecord;
    packageName: string | null;
    publisherId: string | null;
    publisherLogin: string | null;
  },
): BatchItem<"sqlite">[] {
  const { binding, pluginId, operationId, observedAt } = context;
  const { packageFacts, repositoryFacts, compatibility, packageName, publisherId, publisherLogin } =
    input;
  const statements: BatchItem<"sqlite">[] = [];
  const declaredRange =
    typeof compatibility["declaredRange"] === "string" &&
    validRange(compatibility["declaredRange"], { includePrerelease: true })
      ? compatibility["declaredRange"]
      : null;
  statements.push(
    binding.run(
      parameterizedSql(
        `update plugins set
          package_name=coalesce(?,package_name),
          latest_version=coalesce(?,latest_version),
          description=case when exists(
            select 1 from plugin_curations where plugin_id=plugins.id
          ) or (select count(distinct locale) from plugin_localizations
                where plugin_id=plugins.id and locale in ('en','zh')
                  and translation_status='ready')=2
            then description else coalesce(?,description) end,
          license_spdx=coalesce(?,license_spdx),
          homepage_url=coalesce(?,homepage_url),
          repository_url=coalesce(?,repository_url),
          compatibility_range=coalesce(?,compatibility_range),
          publisher_id=coalesce(?,publisher_id),
          author_handle=coalesce(?,author_handle),
          last_synced_at=max(coalesce(last_synced_at,0),?),updated_at=? where id=? and exists(
            select 1 from plugin_operational_state
            where plugin_id=? and last_operation_id=?
          )`,
        [
          packageName,
          typeof packageFacts["version"] === "string" ? packageFacts["version"] : null,
          typeof packageFacts["description"] === "string" ? packageFacts["description"] : null,
          typeof packageFacts["license"] === "string" ? packageFacts["license"] : null,
          typeof packageFacts["homepageUrl"] === "string" ? packageFacts["homepageUrl"] : null,
          typeof packageFacts["repositoryUrl"] === "string"
            ? packageFacts["repositoryUrl"]
            : typeof repositoryFacts["fullName"] === "string"
              ? `https://github.com/${repositoryFacts["fullName"]}`
              : null,
          declaredRange,
          publisherId,
          publisherLogin,
          observedAt,
          Date.now(),
          pluginId,
          pluginId,
          operationId,
        ],
      ),
    ),
  );

  return statements;
}

/** The repository behind the plugin, and the pointer the plugin row keeps to it. */
function repositoryProjection(
  context: ProjectionContext,
  repositoryFacts: JsonRecord,
  publisherId: string | null,
): BatchItem<"sqlite">[] {
  const { binding, pluginId, operationId, observedAt } = context;
  const statements: BatchItem<"sqlite">[] = [];
  const githubId =
    typeof repositoryFacts["githubId"] === "string" ? repositoryFacts["githubId"] : null;
  const fullName =
    typeof repositoryFacts["fullName"] === "string" ? repositoryFacts["fullName"] : null;
  if (githubId && fullName && fullName.includes("/")) {
    const [ownerLogin, name] = fullName.split("/", 2) as [string, string];
    const repositoryId = `repository:${githubId}`;
    const defaultBranch =
      typeof repositoryFacts["defaultBranch"] === "string"
        ? repositoryFacts["defaultBranch"]
        : null;
    const topics = Array.isArray(repositoryFacts["topics"])
      ? JSON.stringify(repositoryFacts["topics"])
      : null;
    const archived =
      typeof repositoryFacts["archived"] === "boolean"
        ? repositoryFacts["archived"]
          ? 1
          : 0
        : null;
    const disabled =
      typeof repositoryFacts["disabled"] === "boolean"
        ? repositoryFacts["disabled"]
          ? 1
          : 0
        : null;
    const stars = typeof repositoryFacts["stars"] === "number" ? repositoryFacts["stars"] : null;
    const forks = typeof repositoryFacts["forks"] === "number" ? repositoryFacts["forks"] : null;
    const openIssues =
      typeof repositoryFacts["openIssues"] === "number" ? repositoryFacts["openIssues"] : null;
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into repositories(
            id,github_id,publisher_id,owner_login,name,full_name,canonical_url,default_branch,description,
            homepage_url,topics_json,primary_language,license_spdx,is_archived,is_disabled,
            stars,forks,open_issues,candidate_status,last_seen_at,updated_at
          ) select ?,?,?,?,?,?,?,coalesce(?,'main'),?,?,coalesce(?,'[]'),?,?,
            coalesce(?,0),coalesce(?,0),coalesce(?,0),coalesce(?,0),coalesce(?,0),'qualified',?,?
          from plugin_operational_state where plugin_id=? and last_operation_id=?
          on conflict(github_id) do update set
            publisher_id=coalesce(excluded.publisher_id,repositories.publisher_id),
            owner_login=excluded.owner_login,name=excluded.name,full_name=excluded.full_name,
            canonical_url=excluded.canonical_url,
            default_branch=case when ? is null then repositories.default_branch else excluded.default_branch end,
            description=coalesce(excluded.description,repositories.description),
            homepage_url=coalesce(excluded.homepage_url,repositories.homepage_url),
            topics_json=case when ? is null then repositories.topics_json else excluded.topics_json end,
            primary_language=coalesce(excluded.primary_language,repositories.primary_language),
            license_spdx=coalesce(excluded.license_spdx,repositories.license_spdx),
            is_archived=case when ? is null then repositories.is_archived else excluded.is_archived end,
            is_disabled=case when ? is null then repositories.is_disabled else excluded.is_disabled end,
            stars=case when ? is null then repositories.stars else excluded.stars end,
            forks=case when ? is null then repositories.forks else excluded.forks end,
            open_issues=case when ? is null then repositories.open_issues else excluded.open_issues end,
            last_seen_at=max(repositories.last_seen_at,excluded.last_seen_at),
            updated_at=excluded.updated_at`,
          [
            repositoryId,
            githubId,
            publisherId,
            ownerLogin,
            name,
            fullName,
            `https://github.com/${fullName}`,
            defaultBranch,
            typeof repositoryFacts["description"] === "string"
              ? repositoryFacts["description"]
              : null,
            typeof repositoryFacts["homepageUrl"] === "string"
              ? repositoryFacts["homepageUrl"]
              : null,
            topics,
            typeof repositoryFacts["primaryLanguage"] === "string"
              ? repositoryFacts["primaryLanguage"]
              : null,
            typeof repositoryFacts["licenseSpdx"] === "string"
              ? repositoryFacts["licenseSpdx"]
              : null,
            archived,
            disabled,
            stars,
            forks,
            openIssues,
            observedAt,
            Date.now(),
            pluginId,
            operationId,
            defaultBranch,
            topics,
            archived,
            disabled,
            stars,
            forks,
            openIssues,
          ],
        ),
      ),
      binding.run(
        parameterizedSql(
          `update plugins set primary_repository_id=?,repository_url=? where id=? and exists(
            select 1 from plugin_operational_state
            where plugin_id=? and last_operation_id=?
          )`,
          [repositoryId, `https://github.com/${fullName}`, pluginId, pluginId, operationId],
        ),
      ),
    );
  }

  return statements;
}

/** The README the plugin page renders, stamped with when that source was read. */
function readmeProjection(
  context: ProjectionContext,
  readmeFacts: JsonRecord,
  provenance: Record<string, FieldProvenance>,
): BatchItem<"sqlite">[] {
  const { binding, pluginId, operationId, observedAt } = context;
  const statements: BatchItem<"sqlite">[] = [];
  if (
    (readmeFacts["availability"] === "available" ||
      readmeFacts["availability"] === "unavailable") &&
    readmeFacts["format"] === "markdown" &&
    typeof readmeFacts["sourceUrl"] === "string"
  ) {
    const readmeObservedAt =
      Date.parse(
        provenance["readme.content"]?.observedAt ??
          provenance["readme.availability"]?.observedAt ??
          "",
      ) || observedAt;
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugin_source_documents(
            id,plugin_id,kind,availability,format,source_url,source_ref,source_path,
            content,content_hash,observed_at,created_at,updated_at
          ) select ?,?,'readme',?,?,?,?,?,?,?,?,?,? from plugin_operational_state
            where plugin_id=? and last_operation_id=?
          on conflict(plugin_id,kind) do update set
            availability=excluded.availability,format=excluded.format,
            source_url=excluded.source_url,source_ref=excluded.source_ref,
            source_path=excluded.source_path,content=excluded.content,
            content_hash=excluded.content_hash,observed_at=excluded.observed_at,
            updated_at=excluded.updated_at`,
          [
            `${pluginId}:readme`,
            pluginId,
            readmeFacts["availability"],
            readmeFacts["format"],
            readmeFacts["sourceUrl"],
            typeof readmeFacts["sourceRef"] === "string" ? readmeFacts["sourceRef"] : null,
            typeof readmeFacts["path"] === "string" ? readmeFacts["path"] : null,
            typeof readmeFacts["content"] === "string" ? readmeFacts["content"] : null,
            typeof readmeFacts["contentHash"] === "string" ? readmeFacts["contentHash"] : null,
            readmeObservedAt,
            Date.now(),
            Date.now(),
            pluginId,
            operationId,
          ],
        ),
      ),
    );
  }

  return statements;
}

/** Headline counts. A fact this read did not report keeps its stored value. */
function metricsProjection(context: ProjectionContext, metrics: JsonRecord): BatchItem<"sqlite">[] {
  const { binding, pluginId, operationId, observedAt } = context;
  const statements: BatchItem<"sqlite">[] = [];
  if (Object.keys(metrics).length) {
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugin_metrics_current(
            plugin_id,github_stars,github_forks,github_open_issues,npm_downloads_day,
            npm_downloads_week,trend_score_7d,trend_score_30d,updated_at
          ) select ?,?,?,?,?,?,0,0,? from plugin_operational_state
          where plugin_id=? and last_operation_id=?
          on conflict(plugin_id) do update set
            github_stars=case when ? is null then plugin_metrics_current.github_stars else ? end,
            github_forks=case when ? is null then plugin_metrics_current.github_forks else ? end,
            github_open_issues=case when ? is null then plugin_metrics_current.github_open_issues else ? end,
            npm_downloads_day=case when ? is null then plugin_metrics_current.npm_downloads_day else ? end,
            npm_downloads_week=case when ? is null then plugin_metrics_current.npm_downloads_week else ? end,
            updated_at=max(plugin_metrics_current.updated_at,excluded.updated_at)`,
          [
            pluginId,
            typeof metrics["githubStars"] === "number" ? metrics["githubStars"] : 0,
            typeof metrics["githubForks"] === "number" ? metrics["githubForks"] : 0,
            typeof metrics["githubOpenIssues"] === "number" ? metrics["githubOpenIssues"] : 0,
            typeof metrics["npmDownloadsDay"] === "number" ? metrics["npmDownloadsDay"] : null,
            typeof metrics["npmDownloadsWeek"] === "number" ? metrics["npmDownloadsWeek"] : null,
            observedAt,
            pluginId,
            operationId,
            typeof metrics["githubStars"] === "number" ? metrics["githubStars"] : null,
            typeof metrics["githubStars"] === "number" ? metrics["githubStars"] : null,
            typeof metrics["githubForks"] === "number" ? metrics["githubForks"] : null,
            typeof metrics["githubForks"] === "number" ? metrics["githubForks"] : null,
            typeof metrics["githubOpenIssues"] === "number" ? metrics["githubOpenIssues"] : null,
            typeof metrics["githubOpenIssues"] === "number" ? metrics["githubOpenIssues"] : null,
            typeof metrics["npmDownloadsDay"] === "number" ? metrics["npmDownloadsDay"] : null,
            typeof metrics["npmDownloadsDay"] === "number" ? metrics["npmDownloadsDay"] : null,
            typeof metrics["npmDownloadsWeek"] === "number" ? metrics["npmDownloadsWeek"] : null,
            typeof metrics["npmDownloadsWeek"] === "number" ? metrics["npmDownloadsWeek"] : null,
          ],
        ),
      ),
    );
  }

  return statements;
}

/** How the plugin is installed. A spec is owned by exactly one plugin. */
async function installTargetProjection(
  context: ProjectionContext,
  input: {
    facts: JsonRecord;
    packageFacts: JsonRecord;
    packageName: string | null;
    fallbackPackageName: string;
    fallbackVersion: string;
    provenance: Record<string, FieldProvenance>;
  },
): Promise<BatchItem<"sqlite">[]> {
  const { binding, pluginId, operationId, observedAt } = context;
  const { facts, packageFacts, packageName, fallbackPackageName, fallbackVersion, provenance } =
    input;
  const statements: BatchItem<"sqlite">[] = [];
  const targets = Array.isArray(facts["installTargets"])
    ? (facts["installTargets"] as JsonRecord[])
    : [];
  for (const target of targets) {
    const resolvedPackageName =
      typeof target["packageName"] === "string"
        ? target["packageName"]
        : (packageName ?? fallbackPackageName);
    const resolvedVersion =
      typeof target["version"] === "string"
        ? target["version"]
        : typeof packageFacts["version"] === "string"
          ? packageFacts["version"]
          : fallbackVersion;
    if (typeof target["kind"] !== "string" || typeof target["spec"] !== "string") continue;
    const existingTarget = await binding.get<{ plugin_id: string }>(
      parameterizedSql(
        `select plugin_id from plugin_install_targets
         where kind=? and spec=? and package_path=? limit 1`,
        [target["kind"], target["spec"], target["packagePath"] ?? ""],
      ),
    );
    if (existingTarget && existingTarget.plugin_id !== pluginId)
      throw new OperationHttpError(
        409,
        "observation_identity_conflict",
        "Install target belongs to a different plugin",
        false,
        {
          details: {
            pluginId,
            conflictingPluginId: existingTarget.plugin_id,
            spec: target["spec"],
          },
        },
      );
    const targetId = `${pluginId}:observed:${(
      await digest(`${target["kind"]}:${target["spec"]}:${target["packagePath"] ?? ""}`)
    ).slice(0, 24)}`;
    const targetObservedAt =
      Date.parse(provenance[installTargetProvenancePath(target) ?? ""]?.observedAt ?? "") ||
      observedAt;
    if (existingTarget)
      statements.push(
        binding.run(
          parameterizedSql(
            `update plugin_install_targets set kind=?,package_name=?,version=?,is_primary=?,
              status=?,verified_at=?,updated_at=?
              where kind=? and spec=? and package_path=? and plugin_id=? and exists(
                select 1 from plugin_operational_state
                where plugin_id=? and last_operation_id=?
              )`,
            [
              target["kind"],
              resolvedPackageName,
              resolvedVersion,
              target["primary"] === true ? 1 : 0,
              target["available"] === false ? "unavailable" : "active",
              targetObservedAt,
              Date.now(),
              target["kind"],
              target["spec"],
              target["packagePath"] ?? "",
              pluginId,
              pluginId,
              operationId,
            ],
          ),
        ),
      );
    else
      statements.push(
        binding.run(
          parameterizedSql(
            `insert into plugin_install_targets(
              id,plugin_id,kind,spec,package_path,package_name,version,is_primary,status,verified_at,updated_at
            ) select ?,?,?,?,?,?,?,?,?,?,? from plugin_operational_state
              where plugin_id=? and last_operation_id=?`,
            [
              targetId,
              pluginId,
              target["kind"],
              target["spec"],
              target["packagePath"] ?? "",
              resolvedPackageName,
              resolvedVersion,
              target["primary"] === true ? 1 : 0,
              target["available"] === false ? "unavailable" : "active",
              targetObservedAt,
              Date.now(),
              pluginId,
              operationId,
            ],
          ),
        ),
      );
  }

  return statements;
}
