import { and, eq, sql } from "drizzle-orm";

import {
  catalogProposalV2Schema,
  catalogSyncItemV1Schema,
  type CatalogProposalV2,
  type CatalogSyncItemV1,
} from "./contracts";
import { sha256 } from "@/lib/auth/tokens.server";
import type { Database } from "@/lib/db/client";
import { catalogSyncItems, catalogSyncRuns } from "@/lib/db/schema";
import { HttpError, uuid } from "@/lib/http";

type ValidationResult = { item?: CatalogSyncItemV1; errors: string[] };

export function catalogIdentityKey(identity: CatalogProposalV2["identity"]): string {
  return identity.kind === "npm"
    ? `npm:${identity.packageName}`
    : `github:${identity.repositoryId}:${identity.subdirectory}`;
}

export function contentSourceMaterial(sources: CatalogProposalV2["sources"]): string {
  return sources
    .filter(
      (source): source is typeof source & { sha256: string } =>
        source.purpose === "content" && typeof source.sha256 === "string",
    )
    .map((source) => `${source.url}\u0000${source.sha256}`)
    .sort()
    .join("\n");
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

async function resolveProposal(
  db: Database,
  runId: string,
  input: CatalogProposalV2,
  reservedSlugs: Set<string>,
): Promise<CatalogSyncItemV1> {
  const identityKey = catalogIdentityKey(input.identity);
  const existing = await db.get<{
    id: string;
    slug: string;
    package_name: string;
    badge: "official" | "verified" | "community";
    trust_tier: "official" | "community";
    featured: number;
  }>(sql`
    select id,slug,package_name,badge,trust_tier,featured
    from plugins where identity_key=${identityKey} limit 1
  `);
  const staged = await db.get<{
    id: string;
    slug: string;
    package_name: string;
    badge: "official" | "verified" | "community";
    trust_tier: "official" | "community";
    featured: number;
  }>(sql`
    select json_extract(payload_json,'$.plugin.id') id,
      json_extract(payload_json,'$.plugin.slug') slug,
      json_extract(payload_json,'$.plugin.packageName') package_name,
      json_extract(payload_json,'$.plugin.badge') badge,
      json_extract(payload_json,'$.plugin.trustTier') trust_tier,
      json_extract(payload_json,'$.plugin.featured') featured
    from catalog_sync_items where run_id=${runId} and item_key=${identityKey}
      and validation_status='accepted' limit 1
  `);
  const current = existing ?? staged;
  const packageConflict = await db.get<{ id: string; identity_key: string }>(sql`
    select id,identity_key from plugins
    where package_name=${input.plugin.packageName} and identity_key<>${identityKey} limit 1
  `);
  if (packageConflict)
    throw new HttpError(
      409,
      "Package name belongs to a different plugin identity",
      "catalog_identity_conflict",
      { identityKey, conflictingIdentityKey: packageConflict.identity_key },
    );

  const pluginId = current?.id ?? uuid();
  let slug = current?.slug ?? slugify(input.plugin.requestedSlug ?? input.plugin.packageName);
  if (!slug) slug = `plugin-${pluginId.slice(0, 8)}`;
  if (!current) {
    const collision = await db.get<{ id: string }>(sql`
      select id from plugins where slug=${slug}
      union all
      select plugin_id id from plugin_aliases where kind='slug' and value=${slug}
      limit 1
    `);
    if (collision || reservedSlugs.has(slug)) slug = `${slug.slice(0, 91)}-${pluginId.slice(0, 8)}`;
  }
  reservedSlugs.add(slug);
  const publisher = await db.get<{ trust_tier: "official" | "community" }>(sql`
    select trust_tier from publishers where github_id=${input.repository.owner.githubId} limit 1
  `);

  return catalogSyncItemV1Schema.parse({
    schemaVersion: 1,
    itemKey: identityKey,
    contentHash: input.contentSourceHash,
    sources: input.sources,
    verification: input.verification,
    repository: {
      ...input.repository,
      owner: {
        ...input.repository.owner,
        trustTier: publisher?.trust_tier ?? "community",
      },
      stars: 0,
      forks: 0,
      openIssues: 0,
      contentHash: input.repository.sourceHash,
    },
    repositoryPackage: {
      ...input.repositoryPackage,
      packageJsonSha: input.verification.packageJsonSha256,
      patchPath: input.verification.patchPath,
      patchSha: input.verification.patchSha256,
      dshBundle: true,
      dshxDetected: input.verification.dshxDetected,
      qualificationStatus: "verified",
      consecutiveFailures: 0,
      checks: input.verification.checks,
    },
    plugin: {
      id: pluginId,
      slug,
      identityKey,
      packageName: input.plugin.packageName,
      badge: current?.badge ?? "verified",
      trustTier: current?.trust_tier ?? "community",
      latestVersion: input.plugin.latestVersion,
      compatibilityRange: input.plugin.compatibilityRange,
      licenseSpdx: input.plugin.licenseSpdx ?? null,
      homepageUrl: input.plugin.homepageUrl ?? null,
      repositoryUrl: input.plugin.repositoryUrl,
      dshxDetected: input.verification.dshxDetected,
      featured: Boolean(current?.featured),
    },
    localizations: input.localizations,
    installTargets: input.installTargets,
    releases: input.releases,
    categories: input.categories,
    capabilities: input.capabilities,
    links: input.links,
    media: [],
  });
}

export function validatePromotionItem(input: unknown): ValidationResult {
  const parsed = catalogSyncItemV1Schema.safeParse(input);
  if (!parsed.success)
    return {
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  const item = parsed.data;
  const errors: string[] = [];
  if (item.repository.isArchived || item.repository.isDisabled)
    errors.push("repository is archived or disabled");
  if (item.repositoryPackage.qualificationStatus !== "verified")
    errors.push("package is not verified");
  if (item.repositoryPackage.checks.some((check) => check.status === "fail"))
    errors.push("deterministic verification failed");
  if (item.repositoryPackage.installKind === "github") {
    if (item.repositoryPackage.subdirectory !== "")
      errors.push("Git-only plugins must be at repository root");
    if (!item.releases.some((release) => release.channel === "stable" && release.gitTag))
      errors.push("Git-only plugins require a stable tag");
  }
  if (item.repositoryPackage.subdirectory && item.repositoryPackage.installKind !== "npm") {
    errors.push("monorepo packages must be published to npm");
  }
  for (const locale of ["en", "zh"] as const) {
    if (!item.localizations.some((entry) => entry.locale === locale && entry.status === "ready")) {
      errors.push(`${locale} localization is not ready`);
    }
  }
  if (item.localizations.some((entry) => entry.sourceContentHash !== item.contentHash))
    errors.push("localizations are stale for the current upstream content hash");
  return errors.length ? { errors } : { item, errors };
}

export async function stageItems(
  binding: D1Database,
  db: Database,
  runId: string,
  inputs: unknown[],
) {
  const [run] = await db
    .select()
    .from(catalogSyncRuns)
    .where(eq(catalogSyncRuns.id, runId))
    .limit(1);
  if (!run) throw new HttpError(404, "Sync run not found", "run_not_found");
  if (run.status !== "open") throw new HttpError(409, "Sync run is not open", "run_closed");
  if (run.schemaVersion !== 2)
    throw new HttpError(409, "Run does not accept CatalogProposalV2", "run_schema_mismatch");

  const parsed = inputs.map((input) => catalogProposalV2Schema.safeParse(input));
  const parseErrors = parsed.flatMap((result, index) =>
    result.success
      ? []
      : result.error.issues.map((issue) => ({
          index,
          path: issue.path.join("."),
          message: issue.message,
        })),
  );
  if (parseErrors.length)
    throw new HttpError(
      422,
      "Catalog page contains invalid proposals",
      "catalog_page_invalid",
      parseErrors,
    );

  const proposals = parsed.map((result) => {
    if (!result.success) throw new Error("unreachable proposal parse state");
    return result.data;
  });
  const contentHashes = await Promise.all(
    proposals.map((proposal) => sha256(contentSourceMaterial(proposal.sources))),
  );
  const hashErrors = proposals.flatMap((proposal, index) =>
    proposal.contentSourceHash === contentHashes[index]
      ? []
      : [
          {
            index,
            path: "contentSourceHash",
            message: "content source hash does not match sources",
          },
        ],
  );
  if (hashErrors.length)
    throw new HttpError(
      422,
      "Catalog page contains invalid content source hashes",
      "content_source_hash_mismatch",
      hashErrors,
    );

  const allowedCategories = new Set(
    (await db.all<{ slug: string }>(sql`select slug from categories`)).map((row) => row.slug),
  );
  const categoryErrors = proposals.flatMap((proposal, index) =>
    proposal.categories
      .filter((category) => !allowedCategories.has(category))
      .map((category) => ({ index, path: "categories", message: `unknown category: ${category}` })),
  );
  if (categoryErrors.length)
    throw new HttpError(
      422,
      "Catalog page contains unknown categories",
      "unknown_category",
      categoryErrors,
    );

  const resolved: CatalogSyncItemV1[] = [];
  const reservedSlugs = new Set<string>();
  for (const proposal of proposals)
    resolved.push(await resolveProposal(db, runId, proposal, reservedSlugs));
  const results = resolved.map(validatePromotionItem);
  const domainErrors = results.flatMap((result, index) =>
    result.errors.map((message) => ({ index, path: "proposal", message })),
  );
  if (domainErrors.length)
    throw new HttpError(
      422,
      "Catalog page failed deterministic policy",
      "catalog_policy_failed",
      domainErrors,
    );
  const items = results.map((result) => result.item!);
  if (new Set(items.map((item) => item.itemKey)).size !== items.length)
    throw new HttpError(422, "Catalog page contains duplicate identities", "duplicate_identity");

  const existingItems = await db
    .select({ itemKey: catalogSyncItems.itemKey })
    .from(catalogSyncItems)
    .where(eq(catalogSyncItems.runId, runId));
  const totalItems = new Set([
    ...existingItems.map((item) => item.itemKey),
    ...items.map((item) => item.itemKey),
  ]).size;
  if (run.expectedItems && totalItems > run.expectedItems)
    throw new HttpError(422, "Catalog page exceeds the run's expected item count", "run_overflow");

  await binding.batch(
    items.map((item) =>
      binding
        .prepare(
          `insert into catalog_sync_items(
            run_id,item_key,content_hash,payload_json,validation_status,
            validation_errors_json,created_at,updated_at
          ) values(?,?,?,?,'accepted','[]',unixepoch()*1000,unixepoch()*1000)
          on conflict(run_id,item_key) do update set
            content_hash=excluded.content_hash,payload_json=excluded.payload_json,
            validation_status='accepted',validation_errors_json='[]',updated_at=excluded.updated_at`,
        )
        .bind(runId, item.itemKey, item.contentHash, JSON.stringify(item)),
    ),
  );
  const [counts] = await db.all<{ received: number; accepted: number; rejected: number }>(sql`
    select count(*) as received,
      sum(case when validation_status='accepted' then 1 else 0 end) as accepted,
      sum(case when validation_status='rejected' then 1 else 0 end) as rejected
    from catalog_sync_items where run_id=${runId}
  `);
  await db
    .update(catalogSyncRuns)
    .set({
      receivedItems: counts?.received ?? 0,
      acceptedItems: counts?.accepted ?? 0,
      rejectedItems: counts?.rejected ?? 0,
    })
    .where(eq(catalogSyncRuns.id, runId));
  return {
    runId,
    ...counts,
    results: items.map((item) => ({
      accepted: true,
      itemKey: item.itemKey,
      pluginId: item.plugin.id,
      slug: item.plugin.slug,
      contentSourceHash: item.contentHash,
    })),
  };
}

const promotionStatements = [
  `insert or ignore into publisher_aliases(id,publisher_id,login,created_at)
   select p.id||':alias:'||p.login,p.id,p.login,unixepoch()*1000
   from publishers p join catalog_sync_items i on i.run_id=? and i.validation_status='accepted'
     and p.github_id=json_extract(i.payload_json,'$.repository.owner.githubId')
   where p.login<>json_extract(i.payload_json,'$.repository.owner.login')`,
  `insert into publishers(id,github_id,login,kind,display_name,avatar_url,profile_url,bio,website_url,trust_tier,updated_at)
   select 'publisher:'||json_extract(payload_json,'$.repository.owner.githubId'), json_extract(payload_json,'$.repository.owner.githubId'), json_extract(payload_json,'$.repository.owner.login'), json_extract(payload_json,'$.repository.owner.kind'), json_extract(payload_json,'$.repository.owner.displayName'), json_extract(payload_json,'$.repository.owner.avatarUrl'), json_extract(payload_json,'$.repository.owner.profileUrl'), json_extract(payload_json,'$.repository.owner.bio'), json_extract(payload_json,'$.repository.owner.websiteUrl'), json_extract(payload_json,'$.repository.owner.trustTier'), unixepoch()*1000 from catalog_sync_items where run_id=? and validation_status='accepted' group by 2 having true
   on conflict(github_id) do update set login=excluded.login,display_name=excluded.display_name,avatar_url=excluded.avatar_url,profile_url=excluded.profile_url,bio=excluded.bio,website_url=excluded.website_url,trust_tier=excluded.trust_tier,updated_at=excluded.updated_at`,
  `insert into repositories(id,github_id,node_id,publisher_id,owner_login,name,full_name,canonical_url,default_branch,description,homepage_url,topics_json,primary_language,license_spdx,is_fork,is_archived,is_disabled,stars,forks,open_issues,candidate_status,etag,content_hash,first_seen_run_id,last_seen_run_id,github_created_at,github_updated_at,pushed_at,updated_at,last_seen_at)
   select 'repository:'||json_extract(payload_json,'$.repository.githubId'),json_extract(payload_json,'$.repository.githubId'),json_extract(payload_json,'$.repository.nodeId'),'publisher:'||json_extract(payload_json,'$.repository.owner.githubId'),json_extract(payload_json,'$.repository.owner.login'),json_extract(payload_json,'$.repository.name'),json_extract(payload_json,'$.repository.fullName'),json_extract(payload_json,'$.repository.canonicalUrl'),json_extract(payload_json,'$.repository.defaultBranch'),json_extract(payload_json,'$.repository.description'),json_extract(payload_json,'$.repository.homepageUrl'),json_extract(payload_json,'$.repository.topics'),json_extract(payload_json,'$.repository.primaryLanguage'),json_extract(payload_json,'$.repository.licenseSpdx'),json_extract(payload_json,'$.repository.isFork'),json_extract(payload_json,'$.repository.isArchived'),json_extract(payload_json,'$.repository.isDisabled'),json_extract(payload_json,'$.repository.stars'),json_extract(payload_json,'$.repository.forks'),json_extract(payload_json,'$.repository.openIssues'),'qualified',json_extract(payload_json,'$.repository.etag'),json_extract(payload_json,'$.repository.contentHash'),?,?,strftime('%s',json_extract(payload_json,'$.repository.createdAt'))*1000,strftime('%s',json_extract(payload_json,'$.repository.updatedAt'))*1000,strftime('%s',json_extract(payload_json,'$.repository.pushedAt'))*1000,unixepoch()*1000,unixepoch()*1000 from catalog_sync_items where run_id=? and validation_status='accepted' group by 2 having true
   on conflict(github_id) do update set node_id=excluded.node_id,publisher_id=excluded.publisher_id,owner_login=excluded.owner_login,name=excluded.name,full_name=excluded.full_name,canonical_url=excluded.canonical_url,default_branch=excluded.default_branch,description=excluded.description,homepage_url=excluded.homepage_url,topics_json=excluded.topics_json,primary_language=excluded.primary_language,license_spdx=excluded.license_spdx,is_fork=excluded.is_fork,is_archived=excluded.is_archived,is_disabled=excluded.is_disabled,etag=excluded.etag,content_hash=excluded.content_hash,last_seen_run_id=excluded.last_seen_run_id,github_created_at=coalesce(repositories.github_created_at,excluded.github_created_at),github_updated_at=excluded.github_updated_at,pushed_at=excluded.pushed_at,last_seen_at=excluded.last_seen_at,updated_at=excluded.updated_at`,
  `insert into repository_packages(id,repository_id,subdirectory,package_name,package_version,package_json_sha,patch_path,patch_sha,npm_package_name,npm_registry_url,install_kind,install_spec,dsh_bundle,dshx_detected,qualification_status,consecutive_failures,validation_summary_json,verified_at,updated_at)
   select 'package:'||json_extract(payload_json,'$.repository.githubId')||':'||json_extract(payload_json,'$.repositoryPackage.subdirectory'),'repository:'||json_extract(payload_json,'$.repository.githubId'),json_extract(payload_json,'$.repositoryPackage.subdirectory'),json_extract(payload_json,'$.repositoryPackage.packageName'),json_extract(payload_json,'$.repositoryPackage.packageVersion'),json_extract(payload_json,'$.repositoryPackage.packageJsonSha'),json_extract(payload_json,'$.repositoryPackage.patchPath'),json_extract(payload_json,'$.repositoryPackage.patchSha'),json_extract(payload_json,'$.repositoryPackage.npmPackageName'),json_extract(payload_json,'$.repositoryPackage.npmRegistryUrl'),json_extract(payload_json,'$.repositoryPackage.installKind'),json_extract(payload_json,'$.repositoryPackage.installSpec'),1,json_extract(payload_json,'$.repositoryPackage.dshxDetected'),'verified',0,json_extract(payload_json,'$.repositoryPackage.checks'),unixepoch()*1000,unixepoch()*1000 from catalog_sync_items where run_id=? and validation_status='accepted'
   on conflict(id) do update set package_name=excluded.package_name,package_version=excluded.package_version,package_json_sha=excluded.package_json_sha,patch_path=excluded.patch_path,patch_sha=excluded.patch_sha,install_kind=excluded.install_kind,install_spec=excluded.install_spec,qualification_status='verified',consecutive_failures=0,validation_summary_json=excluded.validation_summary_json,verified_at=excluded.verified_at,updated_at=excluded.updated_at`,
  `insert into verification_checks(id,repository_package_id,run_id,code,status,observed_json,evidence_url,evidence_sha,checker_version,checked_at)
   select 'check:'||json_extract(i.payload_json,'$.repository.githubId')||':'||json_extract(i.payload_json,'$.repositoryPackage.subdirectory')||':'||?||':'||c.key,
     'package:'||json_extract(i.payload_json,'$.repository.githubId')||':'||json_extract(i.payload_json,'$.repositoryPackage.subdirectory'),?,json_extract(c.value,'$.code'),json_extract(c.value,'$.status'),json_extract(c.value,'$.observed'),json_extract(c.value,'$.evidenceUrl'),json_extract(c.value,'$.evidenceSha'),json_extract(i.payload_json,'$.verification.checkerVersion'),unixepoch()*1000
   from catalog_sync_items i,json_each(i.payload_json,'$.verification.checks') c where i.run_id=? and i.validation_status='accepted'
   on conflict(repository_package_id,run_id,code) do update set status=excluded.status,observed_json=excluded.observed_json,evidence_url=excluded.evidence_url,evidence_sha=excluded.evidence_sha,checker_version=excluded.checker_version,checked_at=excluded.checked_at`,
  `insert or ignore into plugin_aliases(id,plugin_id,kind,value,created_at)
   select p.id||':alias:slug:'||p.slug,p.id,'slug',p.slug,unixepoch()*1000
   from plugins p join catalog_sync_items i on i.run_id=? and i.validation_status='accepted'
     and p.id=json_extract(i.payload_json,'$.plugin.id')
   where p.slug<>json_extract(i.payload_json,'$.plugin.slug')`,
  `insert or ignore into plugin_aliases(id,plugin_id,kind,value,created_at)
   select p.id||':alias:package:'||replace(p.package_name,'/','_'),p.id,'package',p.package_name,unixepoch()*1000
   from plugins p join catalog_sync_items i on i.run_id=? and i.validation_status='accepted'
     and p.id=json_extract(i.payload_json,'$.plugin.id')
   where p.package_name<>json_extract(i.payload_json,'$.plugin.packageName')`,
  `insert into plugins(id,slug,identity_key,package_name,name,description,author_handle,category,badge,latest_version,compatibility_range,publisher_id,primary_repository_id,primary_repository_package_id,active_sync_run_id,verification_status,trust_tier,lifecycle_status,status,license_spdx,homepage_url,repository_url,dshx_detected,featured,first_published_at,last_synced_at,published_at,updated_at)
   select json_extract(payload_json,'$.plugin.id'),json_extract(payload_json,'$.plugin.slug'),json_extract(payload_json,'$.plugin.identityKey'),json_extract(payload_json,'$.plugin.packageName'),json_extract(payload_json,'$.localizations[0].displayName'),json_extract(payload_json,'$.localizations[0].shortDescription'),json_extract(payload_json,'$.repository.owner.login'),json_extract(payload_json,'$.categories[0]'),json_extract(payload_json,'$.plugin.badge'),json_extract(payload_json,'$.plugin.latestVersion'),json_extract(payload_json,'$.plugin.compatibilityRange'),'publisher:'||json_extract(payload_json,'$.repository.owner.githubId'),'repository:'||json_extract(payload_json,'$.repository.githubId'),'package:'||json_extract(payload_json,'$.repository.githubId')||':'||json_extract(payload_json,'$.repositoryPackage.subdirectory'),?,'verified',json_extract(payload_json,'$.plugin.trustTier'),'active','published',json_extract(payload_json,'$.plugin.licenseSpdx'),json_extract(payload_json,'$.plugin.homepageUrl'),json_extract(payload_json,'$.plugin.repositoryUrl'),json_extract(payload_json,'$.plugin.dshxDetected'),json_extract(payload_json,'$.plugin.featured'),unixepoch()*1000,unixepoch()*1000,unixepoch()*1000,unixepoch()*1000 from catalog_sync_items where run_id=? and validation_status='accepted'
   on conflict(id) do update set slug=excluded.slug,identity_key=excluded.identity_key,package_name=excluded.package_name,name=excluded.name,description=excluded.description,author_handle=excluded.author_handle,category=excluded.category,badge=excluded.badge,latest_version=excluded.latest_version,compatibility_range=excluded.compatibility_range,publisher_id=excluded.publisher_id,primary_repository_id=excluded.primary_repository_id,primary_repository_package_id=excluded.primary_repository_package_id,active_sync_run_id=excluded.active_sync_run_id,verification_status='verified',lifecycle_status='active',status='published',license_spdx=excluded.license_spdx,homepage_url=excluded.homepage_url,repository_url=excluded.repository_url,dshx_detected=excluded.dshx_detected,featured=excluded.featured,last_synced_at=excluded.last_synced_at,published_at=coalesce(plugins.published_at,excluded.published_at),updated_at=excluded.updated_at`,
  `delete from plugin_localizations where plugin_id in (select json_extract(payload_json,'$.plugin.id') from catalog_sync_items where run_id=? and validation_status='accepted')`,
  `insert into plugin_localizations(plugin_id,locale,display_name,short_description,overview_markdown,highlights_json,install_notes_markdown,seo_title,seo_description,source_locale,source_content_hash,translation_status,translator,translated_at,updated_at)
   select json_extract(i.payload_json,'$.plugin.id'),json_extract(l.value,'$.locale'),json_extract(l.value,'$.displayName'),json_extract(l.value,'$.shortDescription'),json_extract(l.value,'$.overviewMarkdown'),json_extract(l.value,'$.highlights'),json_extract(l.value,'$.installNotesMarkdown'),json_extract(l.value,'$.seoTitle'),json_extract(l.value,'$.seoDescription'),json_extract(l.value,'$.sourceLocale'),json_extract(l.value,'$.sourceContentHash'),json_extract(l.value,'$.status'),json_extract(l.value,'$.translator'),unixepoch()*1000,unixepoch()*1000 from catalog_sync_items i,json_each(i.payload_json,'$.localizations') l where i.run_id=? and i.validation_status='accepted'`,
  `insert or ignore into plugin_aliases(id,plugin_id,kind,value,created_at)
   select t.plugin_id||':alias:install:'||replace(replace(t.spec,'/','_'),':','_'),t.plugin_id,'install',t.spec,unixepoch()*1000
   from plugin_install_targets t join catalog_sync_items i on i.run_id=? and i.validation_status='accepted'
     and t.plugin_id=json_extract(i.payload_json,'$.plugin.id')
   where not exists(select 1 from json_each(i.payload_json,'$.installTargets') n where json_extract(n.value,'$.spec')=t.spec)`,
  `delete from plugin_install_targets where plugin_id in (select json_extract(payload_json,'$.plugin.id') from catalog_sync_items where run_id=? and validation_status='accepted')`,
  `insert into plugin_install_targets(id,plugin_id,repository_package_id,kind,spec,package_name,version,integrity,is_primary,status,verified_at,updated_at)
   select json_extract(i.payload_json,'$.plugin.id')||':target:'||json_extract(t.value,'$.kind')||':'||json_extract(t.value,'$.spec'),json_extract(i.payload_json,'$.plugin.id'),'package:'||json_extract(i.payload_json,'$.repository.githubId')||':'||json_extract(i.payload_json,'$.repositoryPackage.subdirectory'),json_extract(t.value,'$.kind'),json_extract(t.value,'$.spec'),json_extract(t.value,'$.packageName'),json_extract(t.value,'$.version'),json_extract(t.value,'$.integrity'),json_extract(t.value,'$.primary'),'active',unixepoch()*1000,unixepoch()*1000 from catalog_sync_items i,json_each(i.payload_json,'$.installTargets') t where i.run_id=? and i.validation_status='accepted'`,
  `delete from plugin_releases where plugin_id in (select json_extract(payload_json,'$.plugin.id') from catalog_sync_items where run_id=? and validation_status='accepted')`,
  `insert into plugin_releases(id,plugin_id,version,channel,git_tag,commit_sha,compatibility_range,compatibility_source,release_notes_url,deprecated,published_at,updated_at)
   select json_extract(i.payload_json,'$.plugin.id')||':release:'||json_extract(r.value,'$.version'),json_extract(i.payload_json,'$.plugin.id'),json_extract(r.value,'$.version'),json_extract(r.value,'$.channel'),json_extract(r.value,'$.gitTag'),json_extract(r.value,'$.commitSha'),json_extract(r.value,'$.compatibilityRange'),json_extract(r.value,'$.compatibilitySource'),json_extract(r.value,'$.releaseNotesUrl'),json_extract(r.value,'$.deprecated'),strftime('%s',json_extract(r.value,'$.publishedAt'))*1000,unixepoch()*1000 from catalog_sync_items i,json_each(i.payload_json,'$.releases') r where i.run_id=? and i.validation_status='accepted'`,
  `insert into plugin_dependencies(release_id,package_name,version_range,kind)
   select json_extract(i.payload_json,'$.plugin.id')||':release:'||json_extract(r.value,'$.version'),json_extract(d.value,'$.packageName'),json_extract(d.value,'$.versionRange'),json_extract(d.value,'$.kind') from catalog_sync_items i,json_each(i.payload_json,'$.releases') r,json_each(r.value,'$.dependencies') d where i.run_id=? and i.validation_status='accepted'`,
  `delete from plugin_links where plugin_id in (select json_extract(payload_json,'$.plugin.id') from catalog_sync_items where run_id=? and validation_status='accepted')`,
  `insert into plugin_links(id,plugin_id,kind,url,label,sort_order) select json_extract(i.payload_json,'$.plugin.id')||':link:'||l.key,json_extract(i.payload_json,'$.plugin.id'),json_extract(l.value,'$.kind'),json_extract(l.value,'$.url'),json_extract(l.value,'$.label'),l.key from catalog_sync_items i,json_each(i.payload_json,'$.links') l where i.run_id=? and i.validation_status='accepted'`,
  `delete from plugin_categories where plugin_id in (select json_extract(payload_json,'$.plugin.id') from catalog_sync_items where run_id=? and validation_status='accepted')`,
  `insert into plugin_categories(plugin_id,category_id,is_primary,sort_order) select json_extract(i.payload_json,'$.plugin.id'),'category-'||c.value,case when c.key=0 then 1 else 0 end,c.key from catalog_sync_items i,json_each(i.payload_json,'$.categories') c join categories cc on cc.id='category-'||c.value where i.run_id=? and i.validation_status='accepted'`,
  `delete from plugin_capabilities where plugin_id in (select json_extract(payload_json,'$.plugin.id') from catalog_sync_items where run_id=? and validation_status='accepted')`,
  `insert into plugin_capabilities(id,plugin_id,kind,identifier,observed,metadata_json) select json_extract(i.payload_json,'$.plugin.id')||':cap:'||c.key,json_extract(i.payload_json,'$.plugin.id'),json_extract(c.value,'$.kind'),json_extract(c.value,'$.identifier'),json_extract(c.value,'$.observed'),json_extract(c.value,'$.metadata') from catalog_sync_items i,json_each(i.payload_json,'$.capabilities') c where i.run_id=? and i.validation_status='accepted'`,
  `delete from plugin_search where plugin_id in (select json_extract(payload_json,'$.plugin.id') from catalog_sync_items where run_id=? and validation_status='accepted')`,
  `insert into plugin_search(plugin_id,locale,display_name,short_description,package_name,publisher_login,category_names) select json_extract(i.payload_json,'$.plugin.id'),json_extract(l.value,'$.locale'),json_extract(l.value,'$.displayName'),json_extract(l.value,'$.shortDescription'),json_extract(i.payload_json,'$.plugin.packageName'),json_extract(i.payload_json,'$.repository.owner.login'),(select group_concat(c.value,' ') from json_each(i.payload_json,'$.categories') c) from catalog_sync_items i,json_each(i.payload_json,'$.localizations') l where i.run_id=? and i.validation_status='accepted' and json_extract(l.value,'$.status')='ready'`,
];

const verifiedPromotionStatements = promotionStatements.map((statement) =>
  statement.replaceAll(
    "validation_status='accepted'",
    "validation_status='accepted' and json_extract(payload_json,'$.repositoryPackage.qualificationStatus')='verified'",
  ),
);

export async function promoteRun(binding: D1Database, db: Database, runId: string) {
  const [run] = await db
    .select()
    .from(catalogSyncRuns)
    .where(eq(catalogSyncRuns.id, runId))
    .limit(1);
  if (!run) throw new HttpError(404, "Sync run not found", "run_not_found");
  if (run.status !== "open") throw new HttpError(409, "Sync run is not open", "run_closed");
  if (run.acceptedItems > 500)
    throw new HttpError(422, "A run cannot promote more than 500 plugins", "run_too_large");
  if (run.expectedItems && run.receivedItems !== run.expectedItems)
    throw new HttpError(409, "Run upload is incomplete", "run_incomplete");
  if (run.rejectedItems)
    throw new HttpError(422, "Rejected items must be resolved before commit", "run_has_rejections");
  const bindArgs = verifiedPromotionStatements.map((statement) => {
    const prepared = binding.prepare(statement);
    if (statement.startsWith("insert into repositories")) return prepared.bind(runId, runId, runId);
    if (statement.startsWith("insert into plugins")) return prepared.bind(runId, runId);
    if (statement.startsWith("insert into verification_checks"))
      return prepared.bind(runId, runId, runId);
    return prepared.bind(runId);
  });
  bindArgs.push(
    binding
      .prepare(
        "update catalog_sync_runs set status='committed',committed_at=unixepoch()*1000,finished_at=unixepoch()*1000 where id=? and status='open'",
      )
      .bind(runId),
  );
  await binding.batch(bindArgs);
  const published = await db.get<{ count: number }>(sql`
    select count(*) count from catalog_sync_items where run_id=${runId} and validation_status='accepted'
  `);
  return { id: runId, status: "committed", published: published?.count ?? 0 };
}

export async function getRun(db: Database, runId: string) {
  const [run] = await db
    .select()
    .from(catalogSyncRuns)
    .where(eq(catalogSyncRuns.id, runId))
    .limit(1);
  if (!run) throw new HttpError(404, "Sync run not found", "run_not_found");
  const items = await db
    .select({
      itemKey: catalogSyncItems.itemKey,
      contentHash: catalogSyncItems.contentHash,
      validationStatus: catalogSyncItems.validationStatus,
      validationErrors: catalogSyncItems.validationErrorsJson,
      payload: catalogSyncItems.payloadJson,
      updatedAt: catalogSyncItems.updatedAt,
    })
    .from(catalogSyncItems)
    .where(eq(catalogSyncItems.runId, runId));
  return { ...run, items };
}
