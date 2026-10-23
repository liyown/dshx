import { canonicalJson, type PluginCurationContent } from "@becomeopc/dshx-hub-contracts";
/**
 * Curating and hiding a plugin: the two writes that decide what the public
 * catalog serves.
 *
 * Both bump the revision, restate the public copy in the same batch, and refuse
 * to write when the revision they read is no longer current. Whether the result
 * is `published` is not decided here — `policy.ts` answers that from the
 * operational state, the visibility and whether the copy is complete.
 */

import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "@/lib/db/client";
import { runDrizzleBatch } from "@/lib/db/batch";
import { parameterizedSql } from "@/lib/db/parameterized-sql";

import { buildPluginSeoDescription, buildPluginSeoTitle } from "../../content-quality";
import { digest } from "../../digest";
import { refreshPluginReadiness } from "../../install-readiness.server";
import type { JsonRecord } from "../../json";
import { OperationHttpError } from "../../operations-v1.http";
import { publicationRequirements } from "../../publication-readiness";
import { refreshPluginScore } from "../../scores.server";
import type { SourceSummary } from "../observation/merge";
import {
  fallbackOperationalState,
  findOperationalState,
  findPlugin,
  parseJson,
  readCuration,
  type OperationalRow,
  type PluginRow,
} from "../store";
import { pluginStatusFor } from "./policy";

/**
 * The plugin a curation write is aimed at, and the state it must be written
 * from. An `ifRevision` that no longer matches is the caller's conflict, not a
 * stale read to paper over.
 */
async function loadCurationTarget(
  binding: Database,
  idOrSlug: string,
  ifRevision: number | undefined,
) {
  const plugin = await findPlugin(binding, idOrSlug);
  if (!plugin) throw new OperationHttpError(404, "plugin_not_found", "Plugin not found", false);
  const existingState = await findOperationalState(binding, plugin);
  const state = existingState ?? fallbackOperationalState(plugin);
  if (ifRevision !== undefined && ifRevision !== state.revision)
    throw new OperationHttpError(
      409,
      "revision_conflict",
      `Plugin revision is ${state.revision}, not ${ifRevision}`,
      true,
      {
        repairHint: "Run plugin get, merge the latest content, and retry.",
        details: { expectedRevision: ifRevision, actualRevision: state.revision },
      },
    );
  return { plugin, existingState, state };
}

/** Category slugs come from the API; the join table is keyed by id. */
async function readCategoryIds(binding: Database, content: PluginCurationContent) {
  const categories = await binding.all<{ id: string; slug: string }>(
    parameterizedSql("select id,slug from categories where active=1", []),
  );
  const bySlug = new Map(categories.map((entry) => [entry.slug, entry.id]));
  const unknown = content.categories.filter((category) => !bySlug.has(category));
  if (unknown.length)
    throw new OperationHttpError(
      422,
      "unknown_category",
      "Curation contains unknown categories",
      false,
      {
        path: "content.categories",
        details: { categories: unknown },
      },
    );
  return bySlug;
}

/** Everything one curation write knows once the revision and the target are settled. */
type CurationWrite = {
  binding: Database;
  actorTokenId: string;
  requestId: string;
  plugin: PluginRow;
  existingState: OperationalRow | null;
  state: OperationalRow;
  content: PluginCurationContent;
  before: Awaited<ReturnType<typeof readCuration>>;
  sourceHash: string;
  nextState: "draft" | "published";
  pluginStatus: "draft" | "published" | "archived";
  categoryIds: Map<string, string>;
  nextRevision: number;
  operationId: string;
  now: number;
};

/**
 * Commit a batch whose revision gate is `gateIndex`. A batch that matches
 * nothing there means the row moved between the read and the write.
 */
async function commitRevisioned(
  binding: Database,
  statements: BatchItem<"sqlite">[],
  gateIndex: number,
  conflict: { message: string; repairHint: string },
) {
  const results = await runDrizzleBatch(binding, statements);
  if (!results[gateIndex]?.meta.changes)
    throw new OperationHttpError(409, "revision_conflict", conflict.message, true, {
      repairHint: conflict.repairHint,
    });
}

/** The revision gate: state moves from the revision it was read at, or not at all. */
function operationalStateStatement(write: CurationWrite): BatchItem<"sqlite">[] {
  const { binding, plugin, existingState, state, nextState, nextRevision, operationId, now } =
    write;
  const statements: BatchItem<"sqlite">[] = [];
  if (!existingState)
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugin_operational_state(
            plugin_id,state,visibility,revision,last_operation_id,detection_json,facts_json,sources_json,
            field_provenance_json,last_observed_at,created_at,updated_at
          ) values(?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            plugin.id,
            nextState,
            state.visibility,
            nextRevision,
            operationId,
            state.detection_json,
            state.facts_json,
            state.sources_json,
            state.field_provenance_json,
            state.last_observed_at,
            state.created_at,
            state.updated_at,
          ],
        ),
      ),
    );
  else
    statements.push(
      binding.run(
        parameterizedSql(
          `update plugin_operational_state set state=?,revision=?,last_operation_id=?,updated_at=?
           where plugin_id=? and revision=?`,
          [nextState, nextRevision, operationId, now, plugin.id, state.revision],
        ),
      ),
    );
  return statements;
}

/** The curated copy itself, upserted in the same batch that gates on the state write. */
function curationRowStatement(write: CurationWrite): BatchItem<"sqlite">[] {
  const { binding, plugin, content, operationId, now } = write;
  const statements: BatchItem<"sqlite">[] = [];
  statements.push(
    binding.run(
      parameterizedSql(
        `insert into plugin_curations(
          plugin_id,display_name_json,short_description_json,overview_markdown_json,
          source_readme_hash,categories_json,tags_json,derived_from_json,updated_at
        ) select ?,?,?,?,?,?,?,?,? from plugin_operational_state
          where plugin_id=? and last_operation_id=?
        on conflict(plugin_id) do update set
          display_name_json=excluded.display_name_json,
          short_description_json=excluded.short_description_json,
          overview_markdown_json=excluded.overview_markdown_json,
          source_readme_hash=excluded.source_readme_hash,
          categories_json=excluded.categories_json,tags_json=excluded.tags_json,
          derived_from_json=excluded.derived_from_json,updated_at=excluded.updated_at`,
        [
          plugin.id,
          canonicalJson(content.displayName),
          canonicalJson(content.shortDescription),
          canonicalJson(content.overviewMarkdown),
          content.sourceReadmeHash ?? null,
          canonicalJson(content.categories),
          canonicalJson(content.tags),
          canonicalJson(content.derivedFrom),
          now,
          plugin.id,
          operationId,
        ],
      ),
    ),
  );
  return statements;
}

/** The bilingual copy the public pages render, replaced wholesale each time. */
function localizationStatements(write: CurationWrite): BatchItem<"sqlite">[] {
  const { binding, plugin, content, sourceHash, operationId, now } = write;
  const statements: BatchItem<"sqlite">[] = [];
  statements.push(
    binding.run(
      parameterizedSql(
        `delete from plugin_localizations where plugin_id=?
         and exists(select 1 from plugin_operational_state where plugin_id=? and last_operation_id=?)`,
        [plugin.id, plugin.id, operationId],
      ),
    ),
  );
  for (const locale of ["en", "zh"] as const)
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugin_localizations(
            plugin_id,locale,display_name,short_description,overview_markdown,highlights_json,
            seo_title,seo_description,source_locale,source_content_hash,translation_status,
            translator,translated_at,created_at,updated_at
          ) select ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
          from plugin_operational_state where plugin_id=? and last_operation_id=?`,
          [
            plugin.id,
            locale,
            content.displayName[locale],
            content.shortDescription[locale],
            content.overviewMarkdown[locale],
            "[]",
            buildPluginSeoTitle(content.displayName[locale], locale),
            buildPluginSeoDescription(content.shortDescription[locale], locale),
            locale,
            sourceHash,
            "ready",
            "agent",
            now,
            now,
            now,
            plugin.id,
            operationId,
          ],
        ),
      ),
    );
  return statements;
}

/** The category join, ordered so the first slug stays primary. */
function categoryStatements(write: CurationWrite): BatchItem<"sqlite">[] {
  const { binding, plugin, content, categoryIds: bySlug, operationId } = write;
  const statements: BatchItem<"sqlite">[] = [];
  statements.push(
    binding.run(
      parameterizedSql(
        `delete from plugin_categories where plugin_id=?
         and exists(select 1 from plugin_operational_state where plugin_id=? and last_operation_id=?)`,
        [plugin.id, plugin.id, operationId],
      ),
    ),
  );
  for (let index = 0; index < content.categories.length; index += 1)
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugin_categories(plugin_id,category_id,is_primary,sort_order)
           select ?,?,?,? from plugin_operational_state where plugin_id=? and last_operation_id=?`,
          [
            plugin.id,
            bySlug.get(content.categories[index]!)!,
            index === 0 ? 1 : 0,
            index,
            plugin.id,
            operationId,
          ],
        ),
      ),
    );
  return statements;
}

/** The search index rows, rebuilt from the same copy the pages render. */
function searchStatements(write: CurationWrite): BatchItem<"sqlite">[] {
  const { binding, plugin, content, operationId } = write;
  const statements: BatchItem<"sqlite">[] = [];
  statements.push(
    binding.run(
      parameterizedSql(
        `delete from plugin_search where plugin_id=?
         and exists(select 1 from plugin_operational_state where plugin_id=? and last_operation_id=?)`,
        [plugin.id, plugin.id, operationId],
      ),
    ),
  );
  for (const locale of ["en", "zh"] as const)
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugin_search(
            plugin_id,locale,display_name,short_description,package_name,publisher_login,category_names
          ) select ?,?,?,?,?,?,? from plugin_operational_state
            where plugin_id=? and last_operation_id=?`,
          [
            plugin.id,
            locale,
            content.displayName[locale],
            content.shortDescription[locale],
            plugin.package_name,
            plugin.author_handle,
            content.categories.join(" "),
            plugin.id,
            operationId,
          ],
        ),
      ),
    );
  return statements;
}

/** The public `plugins` row, written last so it only flips once the copy exists. */
function pluginsCopyStatement(write: CurationWrite): BatchItem<"sqlite">[] {
  const { binding, plugin, content, pluginStatus, operationId, now } = write;
  const statements: BatchItem<"sqlite">[] = [];
  statements.push(
    binding.run(
      parameterizedSql(
        `update plugins set name=?,description=?,category=?,status=?,
          published_at=case when ?='published' then coalesce(published_at,?) else published_at end,
          first_published_at=case when ?='published'
            then coalesce(first_published_at,?) else first_published_at end,
          updated_at=? where id=? and exists(
            select 1 from plugin_operational_state where plugin_id=? and last_operation_id=?
          )`,
        [
          content.displayName.en,
          content.shortDescription.en,
          content.categories[0] ?? "uncategorized",
          pluginStatus,
          pluginStatus,
          now,
          pluginStatus,
          now,
          now,
          plugin.id,
          plugin.id,
          operationId,
        ],
      ),
    ),
  );
  return statements;
}

/** Who curated what, and the copy before and after. */
function curationAuditStatement(write: CurationWrite): BatchItem<"sqlite">[] {
  const {
    binding,
    plugin,
    state,
    before,
    content,
    nextRevision,
    operationId,
    actorTokenId,
    requestId,
    now,
  } = write;
  const statements: BatchItem<"sqlite">[] = [];
  statements.push(
    binding.run(
      parameterizedSql(
        `insert into plugin_operation_audit(
          id,request_id,actor_token_id,action,resource_type,resource_id,plugin_id,
          before_revision,after_revision,details_json,created_at
        ) select ?,?,?,?,?,?,?,?,?,?,? from plugin_operational_state
          where plugin_id=? and last_operation_id=?`,
        [
          crypto.randomUUID(),
          requestId,
          actorTokenId,
          "plugin.curate",
          "plugin",
          plugin.id,
          plugin.id,
          state.revision,
          nextRevision,
          canonicalJson({ before, after: content }),
          now,
          plugin.id,
          operationId,
        ],
      ),
    ),
  );
  return statements;
}

/**
 * The batch in write order, with the index of the revision gate so the commit
 * can check exactly one statement.
 */
function curationWriteStatements(write: CurationWrite): {
  statements: BatchItem<"sqlite">[];
  stateWriteIndex: number;
} {
  const statements = operationalStateStatement(write);
  const stateWriteIndex = 0;
  statements.push(...curationRowStatement(write));
  statements.push(...localizationStatements(write));
  statements.push(...categoryStatements(write));
  statements.push(...searchStatements(write));
  statements.push(...pluginsCopyStatement(write));
  statements.push(...curationAuditStatement(write));
  return { statements, stateWriteIndex };
}

/** What a curation write answers: the copy it kept, and the revision that describes it. */
export type CurationResult =
  | {
      status: "unchanged";
      pluginId: string;
      revision: number;
      content: Awaited<ReturnType<typeof readCuration>>;
    }
  | {
      status: "updated";
      pluginId: string;
      revision: number;
      content: PluginCurationContent & { updatedAt: string };
    };

export async function curatePlugin(
  binding: Database,
  actorTokenId: string,
  requestId: string,
  idOrSlug: string,
  content: PluginCurationContent,
  ifRevision?: number,
): Promise<CurationResult> {
  const { plugin, existingState, state } = await loadCurationTarget(binding, idOrSlug, ifRevision);
  const categoryIds = await readCategoryIds(binding, content);
  const before = await readCuration(binding, plugin.id);
  const hasStoredCuration = Boolean(
    await binding.get(
      parameterizedSql("select 1 from plugin_curations where plugin_id=?", [plugin.id]),
    ),
  );
  if (
    hasStoredCuration &&
    canonicalJson(before && { ...before, updatedAt: undefined }) === canonicalJson(content)
  )
    return { status: "unchanged", pluginId: plugin.id, revision: state.revision, content: before };
  const nextRevision = state.revision + 1;
  const now = Date.now();
  const operationId = crypto.randomUUID();
  const sourceHash = await digest(canonicalJson(content));
  const nextState =
    state.state === "published" ||
    publicationRequirements(
      parseJson<JsonRecord>(state.facts_json, {}),
      parseJson<SourceSummary[]>(state.sources_json, []),
      content,
    ).length === 0
      ? "published"
      : "draft";
  // This write is the curation, so the public copy exists by the time the
  // plugins row switches status.
  const pluginStatus = pluginStatusFor(nextState, state.visibility, true);
  const write: CurationWrite = {
    binding,
    actorTokenId,
    requestId,
    plugin,
    existingState,
    state,
    content,
    before,
    sourceHash,
    nextState,
    pluginStatus,
    categoryIds,
    nextRevision,
    operationId,
    now,
  };
  const { statements, stateWriteIndex } = curationWriteStatements(write);
  await commitRevisioned(binding, statements, stateWriteIndex, {
    message: "Plugin changed during curation",
    repairHint: "Run plugin get, merge the latest content, and retry.",
  });
  // Curation is also the transition that publishes a fully curated plugin, so
  // the projections the catalog reads have to be ready before the response.
  await refreshPluginReadiness(binding, plugin.id);
  await refreshPluginScore(binding, plugin.id);
  return {
    status: "updated",
    pluginId: plugin.id,
    revision: nextRevision,
    content: { ...content, updatedAt: new Date(now).toISOString() },
  };
}

/** Whether hiding or restoring moved the plugin, and the revision it landed on. */
export type VisibilityResult =
  | { status: "unchanged"; pluginId: string; visibility: "hidden" | "visible"; revision: number }
  | {
      status: "updated";
      pluginId: string;
      visibility: "hidden" | "visible";
      reason: string;
      revision: number;
    };

export async function setPluginVisibility(
  binding: Database,
  actorTokenId: string,
  requestId: string,
  idOrSlug: string,
  visibility: "hidden" | "visible",
  reason: string,
): Promise<VisibilityResult> {
  const plugin = await findPlugin(binding, idOrSlug);
  if (!plugin) throw new OperationHttpError(404, "plugin_not_found", "Plugin not found", false);
  const existingState = await findOperationalState(binding, plugin);
  const state = existingState ?? fallbackOperationalState(plugin);
  if (state.visibility === visibility && state.visibility_reason === reason)
    return { status: "unchanged", pluginId: plugin.id, visibility, revision: state.revision };
  const nextRevision = state.revision + 1;
  const now = Date.now();
  const operationId = crypto.randomUUID();
  const hasCuration = Boolean(await readCuration(binding, plugin.id));
  const pluginStatus = pluginStatusFor(state.state, visibility, hasCuration);
  const statements: BatchItem<"sqlite">[] = [];
  const stateWriteIndex = statements.length;
  if (!existingState)
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugin_operational_state(
            plugin_id,state,visibility,revision,last_operation_id,detection_json,facts_json,sources_json,
            field_provenance_json,visibility_reason,visibility_changed_at,last_observed_at,created_at,updated_at
          ) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            plugin.id,
            state.state,
            visibility,
            nextRevision,
            operationId,
            state.detection_json,
            state.facts_json,
            state.sources_json,
            state.field_provenance_json,
            reason,
            now,
            state.last_observed_at,
            now,
            now,
          ],
        ),
      ),
    );
  else
    statements.push(
      binding.run(
        parameterizedSql(
          `update plugin_operational_state set visibility=?,visibility_reason=?,
            visibility_changed_at=?,revision=?,last_operation_id=?,updated_at=?
           where plugin_id=? and revision=?`,
          [visibility, reason, now, nextRevision, operationId, now, plugin.id, state.revision],
        ),
      ),
    );
  statements.push(
    binding.run(
      parameterizedSql(
        `update plugins set status=?,
          published_at=case when ?='published' then coalesce(published_at,?) else published_at end,
          first_published_at=case when ?='published'
            then coalesce(first_published_at,?) else first_published_at end,
          updated_at=? where id=? and exists(
          select 1 from plugin_operational_state where plugin_id=? and last_operation_id=?
        )`,
        [
          pluginStatus,
          pluginStatus,
          now,
          pluginStatus,
          now,
          now,
          plugin.id,
          plugin.id,
          operationId,
        ],
      ),
    ),
    binding.run(
      parameterizedSql(
        `insert into plugin_operation_audit(
          id,request_id,actor_token_id,action,resource_type,resource_id,plugin_id,
          before_revision,after_revision,details_json,created_at
        ) select ?,?,?,?,?,?,?,?,?,?,? from plugin_operational_state
          where plugin_id=? and last_operation_id=?`,
        [
          crypto.randomUUID(),
          requestId,
          actorTokenId,
          visibility === "hidden" ? "plugin.hide" : "plugin.restore",
          "plugin",
          plugin.id,
          plugin.id,
          state.revision,
          nextRevision,
          canonicalJson({ visibility, reason }),
          now,
          plugin.id,
          operationId,
        ],
      ),
    ),
  );
  await commitRevisioned(binding, statements, stateWriteIndex, {
    message: "Plugin changed during visibility update",
    repairHint: "Run plugin get and retry the visibility change.",
  });
  // Restoring visibility can publish a plugin that was never scored or
  // assessed for installability while hidden.
  await refreshPluginReadiness(binding, plugin.id);
  await refreshPluginScore(binding, plugin.id);
  return { status: "updated", pluginId: plugin.id, visibility, reason, revision: nextRevision };
}
