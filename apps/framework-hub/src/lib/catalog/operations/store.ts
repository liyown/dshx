/**
 * The rows one plugin is read from.
 *
 * Every module under `operations/` starts the same way: find the plugin, load
 * its operational state, load its current copy. Those reads and their row types
 * live here so no module invents a fourth shape for them. No rule belongs in
 * this file — it returns what the database holds, and the policy modules say
 * what it means.
 */

import type { Database } from "@/lib/db/client";
import { parameterizedSql } from "@/lib/db/parameterized-sql";

export type OperationalRow = {
  plugin_id: string;
  state: "draft" | "published";
  visibility: "visible" | "hidden";
  revision: number;
  last_operation_id: string | null;
  detection_json: string | null;
  facts_json: string;
  sources_json: string;
  field_provenance_json: string;
  visibility_reason: string | null;
  visibility_changed_at: number | null;
  last_observed_at: number | null;
  created_at: number;
  updated_at: number;
};

export type PluginRow = {
  id: string;
  slug: string;
  identity_key: string;
  package_name: string;
  name: string;
  description: string;
  author_handle: string;
  category: string;
  latest_version: string;
  compatibility_range: string;
  status: "draft" | "published" | "archived";
  lifecycle_status: string;
  repository_url: string | null;
  homepage_url: string | null;
  license_spdx: string | null;
  created_at: number;
  updated_at: number;
};

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function findPlugin(binding: Database, idOrSlug: string): Promise<PluginRow | null> {
  return binding.get<PluginRow>(
    parameterizedSql(
      `select id,slug,identity_key,package_name,name,description,author_handle,category,
        latest_version,compatibility_range,status,lifecycle_status,repository_url,homepage_url,
        license_spdx,created_at,updated_at from plugins where id=? or slug=? limit 1`,
      [idOrSlug, idOrSlug],
    ),
  );
}

export async function findOperationalState(
  binding: Database,
  plugin: PluginRow,
): Promise<OperationalRow | null> {
  return binding.get<OperationalRow>(
    parameterizedSql("select * from plugin_operational_state where plugin_id=?", [plugin.id]),
  );
}

export function fallbackOperationalState(plugin: PluginRow): OperationalRow {
  return {
    plugin_id: plugin.id,
    state: plugin.status === "published" ? "published" : "draft",
    visibility: plugin.status === "archived" ? "hidden" : "visible",
    revision: 1,
    last_operation_id: null,
    detection_json: null,
    facts_json: JSON.stringify({
      package: {
        name: plugin.package_name,
        version: plugin.latest_version,
        ...(plugin.description ? { description: plugin.description } : {}),
        ...(plugin.license_spdx ? { license: plugin.license_spdx } : {}),
        ...(plugin.homepage_url ? { homepageUrl: plugin.homepage_url } : {}),
        ...(plugin.repository_url ? { repositoryUrl: plugin.repository_url } : {}),
      },
      ...(plugin.compatibility_range && plugin.compatibility_range !== "*"
        ? { compatibility: { declaredRange: plugin.compatibility_range } }
        : {}),
    }),
    sources_json: "[]",
    field_provenance_json: "{}",
    visibility_reason: null,
    visibility_changed_at: null,
    last_observed_at: plugin.updated_at,
    created_at: plugin.created_at,
    updated_at: plugin.updated_at,
  };
}

export async function readCuration(binding: Database, pluginId: string) {
  const curation = await binding.get<Record<string, unknown>>(
    parameterizedSql("select * from plugin_curations where plugin_id=?", [pluginId]),
  );
  if (curation)
    return {
      displayName: parseJson(curation["display_name_json"], {}),
      shortDescription: parseJson(curation["short_description_json"], {}),
      overviewMarkdown: parseJson(curation["overview_markdown_json"], {}),
      ...(typeof curation["source_readme_hash"] === "string"
        ? { sourceReadmeHash: curation["source_readme_hash"] }
        : {}),
      categories: parseJson(curation["categories_json"], []),
      tags: parseJson(curation["tags_json"], []),
      derivedFrom: parseJson(curation["derived_from_json"], []),
      updatedAt: new Date(Number(curation["updated_at"])).toISOString(),
    };
  const localizations = await binding.all<{
    locale: "en" | "zh";
    display_name: string;
    short_description: string;
    overview_markdown: string;
    updated_at: number;
  }>(
    parameterizedSql(
      `select locale,display_name,short_description,overview_markdown,updated_at
       from plugin_localizations where plugin_id=? and locale in ('en','zh')
         and translation_status='ready'`,
      [pluginId],
    ),
  );
  if (localizations.length < 2) return null;
  const categories = await binding.all<{ slug: string }>(
    parameterizedSql(
      `select c.slug from plugin_categories pc join categories c on c.id=pc.category_id
       where pc.plugin_id=? order by pc.is_primary desc,pc.sort_order`,
      [pluginId],
    ),
  );
  const byLocale = new Map(localizations.map((entry) => [entry.locale, entry]));
  return {
    displayName: {
      en: byLocale.get("en")!.display_name,
      zh: byLocale.get("zh")!.display_name,
    },
    shortDescription: {
      en: byLocale.get("en")!.short_description,
      zh: byLocale.get("zh")!.short_description,
    },
    overviewMarkdown: {
      en: byLocale.get("en")!.overview_markdown,
      zh: byLocale.get("zh")!.overview_markdown,
    },
    categories: categories.map((entry) => entry.slug),
    tags: [],
    derivedFrom: [],
    updatedAt: new Date(Math.max(...localizations.map((entry) => entry.updated_at))).toISOString(),
  };
}

/** The identities this plugin has been observed under, oldest first. */
export function readPluginIdentities(binding: Database, pluginId: string) {
  return binding.all<{ identity_key: string; kind: string; identity_json: string }>(
    parameterizedSql(
      "select identity_key,kind,identity_json from plugin_observation_identities where plugin_id=? order by created_at",
      [pluginId],
    ),
  );
}

/** The install targets the ingest gate projected, primary first. */
export function readInstallTargets(binding: Database, pluginId: string) {
  return binding.all<Record<string, unknown>>(
    parameterizedSql(
      `select kind,spec,package_path packagePath,package_name packageName,version,is_primary isPrimary,status,
        verified_at observedAt from plugin_install_targets where plugin_id=?
       order by is_primary desc,updated_at desc`,
      [pluginId],
    ),
  );
}

/** Screenshots and other media attached to the plugin, with their alt text per locale. */
export function readPluginMedia(binding: Database, pluginId: string) {
  return binding.all<Record<string, unknown>>(
    parameterizedSql(
      `select m.id,m.kind,m.sha256,m.content_type contentType,m.width,m.height,m.byte_size byteSize,
        m.status,m.created_at createdAt,
        (select json_group_object(locale,alt_text) from plugin_media_localizations l where l.media_id=m.id) altText
       from plugin_media m where m.plugin_id=? order by m.sort_order,m.created_at`,
      [pluginId],
    ),
  );
}

/** The last twenty operations that touched this plugin. */
export function readRecentAudit(binding: Database, pluginId: string) {
  return binding.all<Record<string, unknown>>(
    parameterizedSql(
      `select id,request_id requestId,actor_token_id actorTokenId,action,resource_type resourceType,
        resource_id resourceId,before_revision beforeRevision,after_revision afterRevision,
        details_json details,created_at createdAt
       from plugin_operation_audit where plugin_id=? order by created_at desc limit 20`,
      [pluginId],
    ),
  );
}
