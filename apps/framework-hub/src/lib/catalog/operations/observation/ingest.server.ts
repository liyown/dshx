/**
 * Ingest: one observation in, one revisioned write out.
 *
 * The adapter validates the observation, finds or creates the plugin behind its
 * identity, merges the payload into the stored projection, and commits the state
 * row, the projection and the audit entry as one gated batch. The merge rules
 * live in `merge.ts`; the rows the facts project onto live in
 * `projection.server.ts`; this file owns the transaction and the idempotency.
 */

import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "@/lib/db/client";
import { runDrizzleBatch } from "@/lib/db/batch";
import { parameterizedSql } from "@/lib/db/parameterized-sql";

import { digest } from "../../digest";
import { refreshPluginReadiness } from "../../install-readiness.server";
import { jsonRecord, stableJson, type JsonRecord } from "../../json";
import {
  pluginObservationV1Schema,
  type OperationIdentity,
  type PluginObservationV1,
} from "../../operations-v1.contracts";
import {
  OperationHttpError,
  serializeOperationError,
  type OperationErrorBody,
} from "../../operations-v1.http";
import { publicationRequirements } from "../../publication-readiness";
import { refreshPluginScore } from "../../scores.server";
import {
  fallbackOperationalState,
  findOperationalState,
  findPlugin,
  parseJson,
  readCuration,
  type OperationalRow,
  type PluginRow,
} from "../store";
import {
  mergeProjection,
  mergeStoredObservation,
  type FieldDiff,
  type FieldProvenance,
  type SourceSummary,
} from "./merge";
import { projectionStatements } from "./projection.server";

type ObservationWriteResult = {
  identity: string;
  pluginId: string | null;
  status: "created" | "updated" | "unchanged";
  revision: number | null;
  diff: FieldDiff[];
};

export function operationIdentityKey(identity: OperationIdentity): string {
  return identity.kind === "npm"
    ? `npm:${identity.packageName}`
    : `github:${identity.repositoryId}:${identity.subdirectory}`;
}

export async function expectedObservationId(observation: PluginObservationV1): Promise<string> {
  return digest(
    stableJson({
      identity: observation.identity,
      source: {
        url: observation.source.url,
        ref: observation.source.ref ?? null,
        fingerprint: observation.source.etag ?? observation.source.contentHash ?? null,
      },
    }),
  );
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

async function identityMatches(
  binding: Database,
  observation: PluginObservationV1,
): Promise<string[]> {
  const identityKey = operationIdentityKey(observation.identity);
  const direct = await binding.all<{ plugin_id: string }>(
    parameterizedSql("select plugin_id from plugin_observation_identities where identity_key=?", [
      identityKey,
    ]),
  );
  if (direct.length) return [...new Set(direct.map((row) => row.plugin_id))];

  if (observation.identity.kind === "npm") {
    const matches = await binding.all<{ plugin_id: string }>(
      parameterizedSql(
        `select id plugin_id from plugins where package_name=?
         union select plugin_id from plugin_operational_state
           where json_extract(facts_json,'$.package.name')=?`,
        [observation.identity.packageName, observation.identity.packageName],
      ),
    );
    return [...new Set(matches.map((row) => row.plugin_id))];
  }

  const packageFacts = jsonRecord(observation.facts?.package);
  const packageName = typeof packageFacts["name"] === "string" ? packageFacts["name"] : null;
  const matches = await binding.all<{ plugin_id: string }>(
    parameterizedSql(
      `select p.id plugin_id from plugins p
       join repository_packages rp on rp.id=p.primary_repository_package_id
       join repositories r on r.id=rp.repository_id
       where (r.github_id=? or lower(r.full_name)=lower(?)) and rp.subdirectory=?`,
      [
        observation.identity.repositoryId,
        observation.identity.fullName,
        observation.identity.subdirectory,
      ],
    ),
  );
  const packageMatches = packageName
    ? await binding.all<{ plugin_id: string }>(
        parameterizedSql(
          `select id plugin_id from plugins where package_name=?
           union select plugin_id from plugin_operational_state
             where json_extract(facts_json,'$.package.name')=?`,
          [packageName, packageName],
        ),
      )
    : ([] as Array<{ plugin_id: string }>);
  return [...new Set([...matches, ...packageMatches].map((row) => row.plugin_id))];
}

async function newPluginProjection(binding: Database, observation: PluginObservationV1) {
  const pluginId = crypto.randomUUID();
  const identityKey = operationIdentityKey(observation.identity);
  const label =
    observation.identity.kind === "npm"
      ? observation.identity.packageName
      : observation.identity.fullName.split("/").at(-1)!;
  const baseSlug = slugify(label) || `plugin-${pluginId.slice(0, 8)}`;
  const collision = await binding.get(
    parameterizedSql(
      "select id from plugins where slug=? union all select plugin_id id from plugin_aliases where kind='slug' and value=? limit 1",
      [baseSlug, baseSlug],
    ),
  );
  const slug = collision ? `${baseSlug.slice(0, 81)}-${pluginId.slice(0, 8)}` : baseSlug;
  const githubPlaceholder =
    observation.identity.kind === "github"
      ? `github:${observation.identity.repositoryId}:${observation.identity.subdirectory}`
      : null;
  const packageName =
    observation.identity.kind === "npm"
      ? observation.identity.packageName
      : githubPlaceholder!.length <= 214
        ? githubPlaceholder!
        : `${githubPlaceholder!.slice(0, 181)}-${(await digest(githubPlaceholder!)).slice(0, 32)}`;
  const authorHandle =
    observation.identity.kind === "github"
      ? observation.identity.fullName.split("/")[0]!
      : packageName.startsWith("@")
        ? packageName.split("/")[0]!.slice(1)
        : "unknown";
  return {
    id: pluginId,
    slug,
    identityKey,
    packageName,
    name: label,
    authorHandle,
  };
}

/** The stored observation row an idempotent replay is compared against. */
type StoredObservationRow = {
  observation_id: string;
  plugin_id: string;
  identity_key: string;
  payload_hash: string;
  payload_json: string;
  observed_at: number;
};

type NewPluginProjection = Awaited<ReturnType<typeof newPluginProjection>>;
type MergedProjection = ReturnType<typeof mergeProjection>;

/** Everything one observation write knows once it has been read back and merged. */
type ObservationWrite = {
  binding: Database;
  actorTokenId: string;
  requestId: string;
  observation: PluginObservationV1;
  identityKey: string;
  observedAt: number;
  payload: string;
  payloadHash: string;
  status: "created" | "updated";
  plugin: PluginRow;
  newPlugin: NewPluginProjection | null;
  existingObservation: StoredObservationRow | null;
  existingIdentity: { plugin_id: string } | null;
  state: OperationalRow;
  stateRow: OperationalRow | null;
  merged: MergedProjection;
  revision: number;
  operationId: string;
  now: number;
  projected: BatchItem<"sqlite">[];
  factsProjectionChanged: boolean;
};

/**
 * A replay changes nothing, so it answers with the revision already stored.
 * Three paths end here: an older timestamp, a payload that hashes the same, and
 * a concurrent writer that inserted this very observation first.
 */
async function unchangedObservation(
  binding: Database,
  identityKey: string,
  pluginId: string,
): Promise<ObservationWriteResult> {
  const state = await binding.get<{ revision: number }>(
    parameterizedSql("select revision from plugin_operational_state where plugin_id=?", [pluginId]),
  );
  return {
    identity: identityKey,
    pluginId,
    status: "unchanged",
    revision: state?.revision ?? null,
    diff: [],
  };
}

/**
 * Verify the observation is the one it claims to be, then load the payload it
 * is compared against. A wrong id, a different identity or a timestamp from the
 * future are all client errors, so they are answered before anything is read.
 */
async function readObservation(binding: Database, observation: PluginObservationV1) {
  const expectedId = await expectedObservationId(observation);
  if (expectedId !== observation.observationId)
    throw new OperationHttpError(
      422,
      "observation_id_mismatch",
      "observationId does not match the canonical identity and source fingerprint",
      false,
      {
        repairHint: "Regenerate the observation with source inspect.",
        path: "observationId",
        details: { expectedObservationId: expectedId },
      },
    );
  const observedAt = Date.parse(observation.observedAt);
  if (observedAt > Date.now() + 5 * 60_000)
    throw new OperationHttpError(
      422,
      "invalid_observed_at",
      "observedAt cannot be more than five minutes in the future",
      false,
      { path: "observedAt" },
    );
  const identityKey = operationIdentityKey(observation.identity);
  const existingObservation = await binding.get<{
    observation_id: string;
    plugin_id: string;
    identity_key: string;
    payload_hash: string;
    payload_json: string;
    observed_at: number;
  }>(
    parameterizedSql(
      `select observation_id,plugin_id,identity_key,payload_hash,payload_json,observed_at
       from plugin_observations where observation_id=?`,
      [observation.observationId],
    ),
  );
  const previousPayload = existingObservation
    ? parseJson<PluginObservationV1 | null>(existingObservation.payload_json, null)
    : null;
  const storedObservation = previousPayload
    ? mergeStoredObservation(previousPayload, observation)
    : observation;
  const payload = stableJson(storedObservation);
  const payloadHash = await digest(payload);
  return { identityKey, observedAt, existing: existingObservation, payload, payloadHash };
}

/**
 * The plugin this identity belongs to, created on first sight.
 *
 * Facts can match more than one plugin only when two rows were written before
 * the identity was recorded; that is a conflict to resolve by hand, not a
 * choice this adapter can make.
 */
async function resolvePlugin(
  binding: Database,
  observation: PluginObservationV1,
  knownPluginId: string | null,
): Promise<{ plugin: PluginRow; newPlugin: NewPluginProjection | null }> {
  const identityKey = operationIdentityKey(observation.identity);
  const matches = knownPluginId ? [knownPluginId] : await identityMatches(binding, observation);
  if (matches.length > 1)
    throw new OperationHttpError(
      409,
      "observation_identity_conflict",
      "Observation facts match multiple plugins",
      false,
      { details: { identity: identityKey, conflictingPluginIds: matches } },
    );
  let plugin = matches[0] ? await findPlugin(binding, matches[0]) : null;
  const newPlugin = plugin ? null : await newPluginProjection(binding, observation);
  if (!plugin) {
    if (!newPlugin)
      throw new OperationHttpError(
        500,
        "plugin_projection_failed",
        "Plugin projection failed",
        true,
      );
    plugin = {
      id: newPlugin.id,
      slug: newPlugin.slug,
      identity_key: newPlugin.identityKey,
      package_name: newPlugin.packageName,
      name: newPlugin.name,
      description: "",
      author_handle: newPlugin.authorHandle,
      category: "uncategorized",
      latest_version: "0.0.0",
      compatibility_range: "*",
      status: "draft",
      lifecycle_status: "active",
      repository_url: null,
      homepage_url: null,
      license_spdx: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };
  }
  return { plugin, newPlugin };
}

/**
 * Fold the observation into what is stored and decide what follows: the
 * revision (bumped only when something was actually learned) and whether the
 * plugin has now earned `published`.
 */
async function mergeObservation(
  binding: Database,
  plugin: PluginRow,
  newPlugin: NewPluginProjection | null,
  observation: PluginObservationV1,
) {
  const stateRow = await findOperationalState(binding, plugin);
  const state =
    stateRow ??
    (newPlugin
      ? {
          ...fallbackOperationalState(plugin),
          detection_json: null,
          facts_json: "{}",
          last_observed_at: null,
        }
      : fallbackOperationalState(plugin));
  const merged = mergeProjection(
    {
      state: state.state,
      detection: parseJson<JsonRecord | null>(state.detection_json, null),
      facts: parseJson<JsonRecord>(state.facts_json, {}),
      sources: parseJson<SourceSummary[]>(state.sources_json, []),
      provenance: parseJson<Record<string, FieldProvenance>>(state.field_provenance_json, {}),
      lastObservedAt: state.last_observed_at,
    },
    observation,
  );
  const curation = await readCuration(binding, plugin.id);
  if (
    state.state === "published" ||
    publicationRequirements(merged.facts, merged.sources, curation).length === 0
  ) {
    if (merged.state !== "published")
      merged.diff.push({ path: "state", before: merged.state, after: "published" });
    merged.state = "published";
  }
  const resourceRevisionChanged =
    merged.diff.length > 0 || (!stateRow && Boolean(newPlugin)) || !stateRow;
  const factsProjectionChanged = merged.diff.some((entry) => entry.path.startsWith("facts."));
  const revision = stateRow ? state.revision + (resourceRevisionChanged ? 1 : 0) : 1;
  return { state, stateRow, merged, factsProjectionChanged, revision };
}

/** An identity belongs to one plugin; a second owner would split its history. */
async function assertIdentityAvailable(
  binding: Database,
  identityKey: string,
  pluginId: string,
): Promise<{ plugin_id: string } | null> {
  const existing = await binding.get<{ plugin_id: string }>(
    parameterizedSql("select plugin_id from plugin_observation_identities where identity_key=?", [
      identityKey,
    ]),
  );
  if (existing && existing.plugin_id !== pluginId)
    throw new OperationHttpError(
      409,
      "observation_identity_conflict",
      "Observation identity belongs to a different plugin",
      false,
      { details: { identity: identityKey, conflictingPluginId: existing.plugin_id } },
    );
  return existing;
}

/** The `plugins` row a first observation creates, before it is curated. */
function newPluginStatement(write: ObservationWrite): BatchItem<"sqlite">[] {
  const { binding, newPlugin, now } = write;
  const statements: BatchItem<"sqlite">[] = [];
  if (newPlugin) {
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugins(
            id,slug,identity_key,package_name,name,description,author_handle,category,badge,
            latest_version,compatibility_range,verification_status,trust_tier,lifecycle_status,
            status,dshx_detected,featured,created_at,updated_at
          ) values(?,?,?,?,?,?,?,?,? ,?,?,?,'community','active','draft',0,0,?,?)`,
          [
            newPlugin.id,
            newPlugin.slug,
            newPlugin.identityKey,
            newPlugin.packageName,
            newPlugin.name,
            "",
            newPlugin.authorHandle,
            "uncategorized",
            "community",
            "0.0.0",
            "*",
            "pending",
            now,
            now,
          ],
        ),
      ),
    );
  }
  return statements;
}

/**
 * The state write whose row count is the revision gate: if the state moved
 * between reading it and this batch, the update matches nothing and the whole
 * observation is refused.
 */
function stateWriteStatement(write: ObservationWrite): BatchItem<"sqlite">[] {
  const {
    binding,
    plugin,
    stateRow,
    state,
    merged,
    revision: afterRevision,
    operationId,
    now,
  } = write;
  const statements: BatchItem<"sqlite">[] = [];
  if (stateRow) {
    statements.push(
      binding.run(
        parameterizedSql(
          `update plugin_operational_state set
            state=?,revision=?,last_operation_id=?,detection_json=?,facts_json=?,sources_json=?,
            field_provenance_json=?,last_observed_at=?,updated_at=?
           where plugin_id=? and revision=?`,
          [
            merged.state,
            afterRevision,
            operationId,
            merged.detection ? stableJson(merged.detection) : null,
            stableJson(merged.facts),
            stableJson(merged.sources),
            stableJson(merged.provenance),
            merged.lastObservedAt,
            now,
            plugin.id,
            state.revision,
          ],
        ),
      ),
    );
  } else {
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugin_operational_state(
            plugin_id,state,visibility,revision,last_operation_id,detection_json,facts_json,sources_json,
            field_provenance_json,last_observed_at,created_at,updated_at
          ) values(?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            plugin.id,
            merged.state,
            state.visibility,
            afterRevision,
            operationId,
            merged.detection ? stableJson(merged.detection) : null,
            stableJson(merged.facts),
            stableJson(merged.sources),
            stableJson(merged.provenance),
            merged.lastObservedAt,
            now,
            now,
          ],
        ),
      ),
    );
  }
  return statements;
}

/** The identity the next read will match this plugin by. */
function identityStatement(write: ObservationWrite): BatchItem<"sqlite">[] {
  const {
    binding,
    plugin,
    observation,
    identityKey,
    observedAt,
    existingIdentity,
    operationId,
    now,
  } = write;
  const statements: BatchItem<"sqlite">[] = [];
  if (!existingIdentity)
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugin_observation_identities(
            identity_key,plugin_id,kind,identity_json,last_observed_at,created_at
          ) select ?,?,?,?,?,? from plugin_operational_state
            where plugin_id=? and last_operation_id=?`,
          [
            identityKey,
            plugin.id,
            observation.identity.kind,
            stableJson(observation.identity),
            observedAt,
            now,
            plugin.id,
            operationId,
          ],
        ),
      ),
    );
  else
    statements.push(
      binding.run(
        parameterizedSql(
          `update plugin_observation_identities set identity_json=?,last_observed_at=?
           where identity_key=? and plugin_id=? and coalesce(last_observed_at,0)<=? and exists(
             select 1 from plugin_operational_state
             where plugin_id=? and last_operation_id=?
           )`,
          [
            stableJson(observation.identity),
            observedAt,
            identityKey,
            plugin.id,
            observedAt,
            plugin.id,
            operationId,
          ],
        ),
      ),
    );
  return statements;
}

/** The observation itself, with the merged payload that a replay will hash. */
function observationStatement(write: ObservationWrite): BatchItem<"sqlite">[] {
  const {
    binding,
    plugin,
    observation,
    identityKey,
    observedAt,
    existingObservation,
    payload,
    payloadHash,
    actorTokenId,
    operationId,
    now,
  } = write;
  const statements: BatchItem<"sqlite">[] = [];
  if (existingObservation)
    statements.push(
      binding.run(
        parameterizedSql(
          `update plugin_observations set
            observed_at=?,source_kind=?,source_url=?,source_ref=?,source_etag=?,
            source_content_hash=?,source_availability=?,payload_hash=?,payload_json=?,
            actor_token_id=?,updated_at=? where observation_id=? and exists(
              select 1 from plugin_operational_state
              where plugin_id=? and last_operation_id=?
            )`,
          [
            observedAt,
            observation.source.kind,
            observation.source.url,
            observation.source.ref ?? null,
            observation.source.etag ?? null,
            observation.source.contentHash ?? null,
            observation.source.availability,
            payloadHash,
            payload,
            actorTokenId,
            now,
            observation.observationId,
            plugin.id,
            operationId,
          ],
        ),
      ),
    );
  else
    statements.push(
      binding.run(
        parameterizedSql(
          `insert into plugin_observations(
            observation_id,schema_version,plugin_id,identity_key,observed_at,source_kind,source_url,
            source_ref,source_etag,source_content_hash,source_availability,payload_hash,payload_json,
            actor_token_id,created_at,updated_at
          ) select ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? from plugin_operational_state
            where plugin_id=? and last_operation_id=?`,
          [
            observation.observationId,
            1,
            plugin.id,
            identityKey,
            observedAt,
            observation.source.kind,
            observation.source.url,
            observation.source.ref ?? null,
            observation.source.etag ?? null,
            observation.source.contentHash ?? null,
            observation.source.availability,
            payloadHash,
            payload,
            actorTokenId,
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

/** Going public is a consequence of the merged state, not of this observation. */
function publicationStatement(write: ObservationWrite): BatchItem<"sqlite">[] {
  const { binding, plugin, merged, state, operationId, now } = write;
  const statements: BatchItem<"sqlite">[] = [];
  if (merged.state === "published" && state.visibility === "visible")
    statements.push(
      binding.run(
        parameterizedSql(
          `update plugins set status='published',published_at=coalesce(published_at,?),
            first_published_at=coalesce(first_published_at,?),updated_at=?
           where id=? and exists(
             select 1 from plugin_operational_state
             where plugin_id=? and last_operation_id=?
           )`,
          [now, now, now, plugin.id, plugin.id, operationId],
        ),
      ),
    );
  return statements;
}

/** What changed, for the operator who has to explain it later. */
function auditStatement(write: ObservationWrite): BatchItem<"sqlite">[] {
  const {
    binding,
    plugin,
    observation,
    identityKey,
    state,
    stateRow,
    merged,
    status,
    actorTokenId,
    requestId,
    revision: afterRevision,
    operationId,
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
          `observation.${status}`,
          "observation",
          observation.observationId,
          plugin.id,
          stateRow ? state.revision : null,
          afterRevision,
          stableJson({ identity: identityKey, diff: merged.diff }),
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
 * The batch, in the order the rows depend on each other. `stateWriteIndex`
 * points at the revision gate so the commit can check it.
 */
function observationWriteStatements(write: ObservationWrite): {
  statements: BatchItem<"sqlite">[];
  stateWriteIndex: number;
} {
  const statements = newPluginStatement(write);
  const stateWriteIndex = statements.length;
  statements.push(...stateWriteStatement(write));
  statements.push(...identityStatement(write));
  statements.push(...observationStatement(write));
  if (write.factsProjectionChanged) statements.push(...write.projected);
  statements.push(...publicationStatement(write));
  statements.push(...auditStatement(write));
  return { statements, stateWriteIndex };
}

/**
 * Commit, and turn a lost race into either a replay or a conflict: the revision
 * gate says "someone wrote first", the UNIQUE branch says "this very
 * observation arrived twice at once".
 */
async function commitObservation(
  write: ObservationWrite,
  statements: BatchItem<"sqlite">[],
  stateWriteIndex: number,
): Promise<ObservationWriteResult | null> {
  try {
    const results = await runDrizzleBatch(write.binding, statements);
    if (!results[stateWriteIndex]?.meta.changes)
      throw new OperationHttpError(
        409,
        "revision_conflict",
        "Plugin changed while applying the observation",
        true,
        { repairHint: "Run plugin get and retry the observation." },
      );
    return null;
  } catch (error) {
    if (error instanceof OperationHttpError) throw error;
    if (error instanceof Error && /plugin_operational_state\.plugin_id/i.test(error.message))
      throw new OperationHttpError(
        409,
        "revision_conflict",
        "Plugin state was created concurrently",
        true,
        { repairHint: "Run plugin get and retry the observation." },
      );
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      const winner = await write.binding.get<{
        plugin_id: string;
        identity_key: string;
        payload_hash: string;
      }>(
        parameterizedSql(
          `select plugin_id,identity_key,payload_hash from plugin_observations
           where observation_id=?`,
          [write.observation.observationId],
        ),
      );
      if (winner?.identity_key === write.identityKey && winner.payload_hash === write.payloadHash)
        return unchangedObservation(write.binding, write.identityKey, winner.plugin_id);
      throw new OperationHttpError(
        409,
        "revision_conflict",
        "A concurrent observation changed the catalog projection",
        true,
        { repairHint: "Retry the same observation once." },
      );
    }
    throw error;
  }
}

export async function upsertObservation(
  binding: Database,
  actorTokenId: string,
  requestId: string,
  observation: PluginObservationV1,
  dryRun = false,
): Promise<ObservationWriteResult> {
  const stored = await readObservation(binding, observation);
  if (stored.existing && stored.observedAt < stored.existing.observed_at)
    return unchangedObservation(binding, stored.identityKey, stored.existing.plugin_id);
  if (stored.existing?.payload_hash === stored.payloadHash)
    return unchangedObservation(binding, stored.identityKey, stored.existing.plugin_id);

  const { plugin, newPlugin } = await resolvePlugin(
    binding,
    observation,
    stored.existing?.plugin_id ?? null,
  );
  const merged = await mergeObservation(binding, plugin, newPlugin, observation);
  const operationId = crypto.randomUUID();
  const existingIdentity = await assertIdentityAvailable(binding, stored.identityKey, plugin.id);
  const projected = merged.factsProjectionChanged
    ? await projectionStatements(
        binding,
        plugin.id,
        merged.merged.facts,
        merged.merged.provenance,
        stored.observedAt,
        operationId,
        plugin.package_name,
        plugin.latest_version,
      )
    : [];
  const status = stored.existing ? "updated" : "created";
  if (dryRun)
    return {
      identity: stored.identityKey,
      pluginId: newPlugin ? null : plugin.id,
      status,
      revision: merged.revision,
      diff: merged.merged.diff,
    };

  const write: ObservationWrite = {
    binding,
    actorTokenId,
    requestId,
    observation,
    identityKey: stored.identityKey,
    observedAt: stored.observedAt,
    payload: stored.payload,
    payloadHash: stored.payloadHash,
    status,
    plugin,
    newPlugin,
    existingObservation: stored.existing,
    existingIdentity,
    state: merged.state,
    stateRow: merged.stateRow,
    merged: merged.merged,
    revision: merged.revision,
    operationId,
    now: Date.now(),
    projected,
    factsProjectionChanged: merged.factsProjectionChanged,
  };
  const { statements, stateWriteIndex } = observationWriteStatements(write);
  const replay = await commitObservation(write, statements, stateWriteIndex);
  if (replay) return replay;
  // The observation rewrote the facts the catalog ranks on and the install
  // targets it filters on; refresh both projections after the batch
  // committed. Failures do not fail the observation: the catalog falls back
  // to the live formula and treats a missing readiness row as "not ready".
  // Readiness feeds the score, so it is recomputed first.
  await refreshPluginReadiness(binding, plugin.id);
  await refreshPluginScore(binding, plugin.id);
  return {
    identity: stored.identityKey,
    pluginId: plugin.id,
    status,
    revision: merged.revision,
    diff: merged.merged.diff,
  };
}

export async function upsertObservationBatch(
  binding: Database,
  actorTokenId: string,
  requestId: string,
  inputs: unknown[],
  dryRun: boolean,
) {
  const results: Array<
    ObservationWriteResult | { identity: string; status: "rejected"; error: OperationErrorBody }
  > = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const parsed = pluginObservationV1Schema.safeParse(inputs[index]);
    if (!parsed.success) {
      const record =
        inputs[index] && typeof inputs[index] === "object" && !Array.isArray(inputs[index])
          ? (inputs[index] as Record<string, unknown>)
          : null;
      const unsupportedVersion =
        record?.["schemaVersion"] !== undefined && record["schemaVersion"] !== 1;
      results.push({
        identity: `item:${index}`,
        status: "rejected",
        error: {
          code: unsupportedVersion ? "contract_version_unsupported" : "invalid_observation",
          message: unsupportedVersion
            ? `Unsupported schemaVersion: ${String(record?.["schemaVersion"])}`
            : "Observation validation failed",
          retryable: false,
          repairHint: unsupportedVersion
            ? "Regenerate the observation with the current CLI contract."
            : "Correct the reported input paths and retry only this item.",
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      continue;
    }
    try {
      results.push(
        await upsertObservation(
          binding,
          actorTokenId,
          `${requestId}:${index}`,
          parsed.data,
          dryRun,
        ),
      );
    } catch (error) {
      results.push({
        identity: operationIdentityKey(parsed.data.identity),
        status: "rejected",
        error: serializeOperationError(error),
      });
    }
  }
  return { results };
}
