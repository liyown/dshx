import { satisfies, validRange } from "semver";
import type { BatchItem } from "drizzle-orm/batch";

import type { Database } from "@/lib/db/client";
import { runDrizzleBatch } from "@/lib/db/batch";
import { parameterizedSql } from "@/lib/db/parameterized-sql";
import { buildPluginSeoDescription, buildPluginSeoTitle } from "./content-quality";

import {
  pluginObservationV1Schema,
  type OperationIdentity,
  type OpsPluginListQuery,
  type PluginCurationContent,
  type PluginObservationV1,
  type SubmissionListQuery,
  type SubmissionResolution,
} from "./operations-v1.contracts";
import {
  OperationHttpError,
  serializeOperationError,
  type OperationErrorBody,
} from "./operations-v1.http";

const SOURCE_STALE_MS = 30 * 86_400_000;
const CURRENT_DSH_VERSION = "0.1.0-rc.8";

type JsonRecord = Record<string, unknown>;

type OperationalRow = {
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

type PluginRow = {
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

type SourceSummary = {
  kind: PluginObservationV1["source"]["kind"];
  url: string;
  ref?: string;
  etag?: string;
  contentHash?: string;
  availability: "available" | "unavailable";
  lastObservedAt: string;
  lastSuccessfulAt?: string;
  observationId: string;
};

type FieldProvenance = {
  observationId: string;
  sourceKind: PluginObservationV1["source"]["kind"];
  sourceUrl: string;
  observedAt: string;
  priority: number;
};

type FieldDiff = {
  path: string;
  before: unknown;
  after: unknown;
  source?: {
    kind: string;
    url: string;
    observationId: string;
  };
};

type ObservationWriteResult = {
  identity: string;
  pluginId: string | null;
  status: "created" | "updated" | "unchanged";
  revision: number | null;
  diff: FieldDiff[];
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function jsonRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function hasUnsafeInstallSpecCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 32 || code === 127;
  });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function mergeRecords(previous: JsonRecord, incoming: JsonRecord): JsonRecord {
  const merged = structuredClone(previous);
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    const before = merged[key];
    merged[key] =
      before &&
      value &&
      typeof before === "object" &&
      typeof value === "object" &&
      !Array.isArray(before) &&
      !Array.isArray(value)
        ? mergeRecords(before as JsonRecord, value as JsonRecord)
        : structuredClone(value);
  }
  return merged;
}

function mergeStoredObservation(
  previous: PluginObservationV1,
  incoming: PluginObservationV1,
): PluginObservationV1 {
  if (incoming.source.availability === "unavailable")
    return {
      ...incoming,
      ...(previous.detection ? { detection: previous.detection } : {}),
      ...(previous.facts ? { facts: previous.facts } : {}),
    };
  const previousFacts = previous.facts ? (structuredClone(previous.facts) as JsonRecord) : {};
  const incomingFacts = incoming.facts ? (structuredClone(incoming.facts) as JsonRecord) : {};
  const previousTargets = Array.isArray(previousFacts["installTargets"])
    ? (previousFacts["installTargets"] as JsonRecord[])
    : [];
  const incomingTargets = Array.isArray(incomingFacts["installTargets"])
    ? (incomingFacts["installTargets"] as JsonRecord[])
    : [];
  delete previousFacts["installTargets"];
  delete incomingFacts["installTargets"];
  const facts = mergeRecords(previousFacts, incomingFacts);
  if (previousTargets.length || incomingTargets.length) {
    const byKey = new Map(
      previousTargets.flatMap((target) => {
        const key = installTargetKey(target);
        return key ? [[key, structuredClone(target)] as const] : [];
      }),
    );
    for (const target of incomingTargets) {
      const key = installTargetKey(target);
      if (!key) continue;
      byKey.set(key, byKey.has(key) ? { ...byKey.get(key)!, ...target } : target);
    }
    facts["installTargets"] = [...byKey.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, target]) => target);
  }
  const detection = incoming.detection ?? previous.detection;
  return {
    ...incoming,
    ...(detection ? { detection } : {}),
    ...(Object.keys(facts).length ? { facts } : {}),
  } as PluginObservationV1;
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

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

function encodeCursor(updatedAt: number, id: string): string {
  return btoa(JSON.stringify([updatedAt, id]))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeCursor(cursor?: string): [number, string] | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(atob(cursor.replaceAll("-", "+").replaceAll("_", "/"))) as unknown;
    if (
      Array.isArray(parsed) &&
      typeof parsed[0] === "number" &&
      Number.isFinite(parsed[0]) &&
      typeof parsed[1] === "string"
    )
      return [parsed[0], parsed[1]];
  } catch {
    // Normalized below.
  }
  throw new OperationHttpError(422, "invalid_cursor", "The pagination cursor is invalid", false, {
    repairHint: "Restart the query without the cursor.",
  });
}

function flatten(value: unknown, prefix = "", output: Record<string, unknown> = {}) {
  if (Array.isArray(value) || value === null || typeof value !== "object") {
    if (prefix) output[prefix] = value;
    return output;
  }
  for (const [key, entry] of Object.entries(value as JsonRecord)) {
    if (entry === undefined) continue;
    flatten(entry, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

function valueAtPath(root: JsonRecord, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as JsonRecord)[segment];
  }
  return current;
}

function setAtPath(root: JsonRecord, path: string, value: unknown) {
  const segments = path.split(".");
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    const child = current[segment];
    if (!child || typeof child !== "object" || Array.isArray(child)) current[segment] = {};
    current = current[segment] as JsonRecord;
  }
  current[segments.at(-1)!] = structuredClone(value);
}

function factPriority(path: string, observation: PluginObservationV1): number {
  const kind = observation.source.kind;
  const exactNpmManifest = kind === "npm" && Boolean(observation.source.ref);
  if (path.startsWith("publisher.")) {
    if (kind === "github") return 600;
    if (kind === "npm") return 500;
    return 200;
  }
  if (path.startsWith("readme.")) {
    if (kind === "github" || kind === "npm") return 600;
    if (kind === "readme") return 550;
    return 200;
  }
  if (path.startsWith("package.description") || path.startsWith("package.homepageUrl")) {
    if (exactNpmManifest) return 600;
    if (kind === "npm") return 550;
    if (kind === "github") return 525;
    if (kind === "readme") return 500;
    if (kind === "release") return 350;
    return 200;
  }
  if (path.startsWith("package.") || path.startsWith("installTargets")) {
    if (exactNpmManifest) return 600;
    if (kind === "npm") return 550;
    if (kind === "github") return 525;
    if (kind === "release") return 500;
    if (kind === "readme") return 300;
    return 200;
  }
  if (path.startsWith("repository.") || path.startsWith("metrics.github")) {
    if (kind === "github") return 600;
    if (kind === "release") return 500;
    if (kind === "npm") return 400;
    if (kind === "readme") return 300;
    return 200;
  }
  if (path.startsWith("metrics.npm")) return kind === "npm" ? 600 : 200;
  if (path.startsWith("compatibility.")) {
    if (exactNpmManifest) return 600;
    if (kind === "npm") return 550;
    if (kind === "release") return 500;
    if (kind === "readme") return 400;
    if (kind === "github") return 300;
    return 200;
  }
  return 100;
}

function sourceKey(source: Pick<SourceSummary, "kind" | "url">): string {
  return `${source.kind}\u0000${source.url}`;
}

function installTargetKey(target: JsonRecord): string | null {
  return typeof target["kind"] === "string" && typeof target["spec"] === "string"
    ? `${target["kind"]}\u0000${target["spec"]}\u0000${
        typeof target["packagePath"] === "string" ? target["packagePath"] : ""
      }`
    : null;
}

function installTargetProvenancePath(target: JsonRecord): string | null {
  const key = installTargetKey(target);
  return key ? `installTargets.${encodeURIComponent(key)}` : null;
}

function observationWins(
  existing: FieldProvenance | undefined,
  observationId: string,
  incomingAt: number,
  priority: number,
  fallbackObservedAt = -Infinity,
): boolean {
  if (existing?.observationId === observationId) return true;
  const parsedExistingAt = existing ? Date.parse(existing.observedAt) : fallbackObservedAt;
  const existingAt = Number.isFinite(parsedExistingAt) ? parsedExistingAt : fallbackObservedAt;
  const existingPriority = existing?.priority ?? 0;
  if (incomingAt < existingAt || priority < existingPriority) return false;
  if (incomingAt > existingAt || priority > existingPriority) return true;
  return observationId.localeCompare(existing?.observationId ?? "legacy") > 0;
}

function mergeProjection(
  current: {
    state: "draft" | "published";
    detection: JsonRecord | null;
    facts: JsonRecord;
    sources: SourceSummary[];
    provenance: Record<string, FieldProvenance>;
    lastObservedAt: number | null;
  },
  observation: PluginObservationV1,
) {
  const facts = structuredClone(current.facts);
  const provenance = structuredClone(current.provenance);
  const sources = structuredClone(current.sources);
  const state = current.state;
  let detection = current.detection ? structuredClone(current.detection) : null;
  const diff: FieldDiff[] = [];
  const incomingAt = Date.parse(observation.observedAt);

  const existingSourceIndex = sources.findIndex(
    (source) => sourceKey(source) === sourceKey(observation.source),
  );
  const existingSource = existingSourceIndex >= 0 ? sources[existingSourceIndex] : undefined;
  const existingSourceAt = existingSource ? Date.parse(existingSource.lastObservedAt) : -Infinity;
  if (
    !existingSource ||
    incomingAt > existingSourceAt ||
    (incomingAt === existingSourceAt &&
      observation.observationId.localeCompare(existingSource.observationId) >= 0)
  ) {
    const nextSource: SourceSummary = {
      kind: observation.source.kind,
      url: observation.source.url,
      ...(observation.source.ref ? { ref: observation.source.ref } : {}),
      ...(observation.source.etag ? { etag: observation.source.etag } : {}),
      ...(observation.source.contentHash ? { contentHash: observation.source.contentHash } : {}),
      availability: observation.source.availability,
      lastObservedAt: observation.observedAt,
      ...(observation.source.availability === "available"
        ? { lastSuccessfulAt: observation.observedAt }
        : existingSource?.lastSuccessfulAt
          ? { lastSuccessfulAt: existingSource.lastSuccessfulAt }
          : {}),
      observationId: observation.observationId,
    };
    diff.push({
      path: `sources.${sourceKey(nextSource)}`,
      before: existingSource,
      after: nextSource,
    });
    if (existingSourceIndex >= 0) sources[existingSourceIndex] = nextSource;
    else sources.push(nextSource);
  }

  if (observation.source.availability === "available") {
    const incomingFacts = structuredClone(observation.facts ?? {}) as JsonRecord;
    const incomingTargets = Array.isArray(incomingFacts["installTargets"])
      ? (incomingFacts["installTargets"] as JsonRecord[])
      : [];
    delete incomingFacts["installTargets"];
    for (const [path, incoming] of Object.entries(flatten(incomingFacts))) {
      const priority = factPriority(path, observation);
      const existing = provenance[path];
      const before = valueAtPath(facts, path);
      // Recency is an absolute gate: replaying an older observation must never
      // replace a value learned later, even when the old source ranks higher.
      const wins = observationWins(
        existing,
        observation.observationId,
        incomingAt,
        priority,
        before === undefined ? -Infinity : (current.lastObservedAt ?? -Infinity),
      );
      if (!wins) continue;
      if (stableJson(before) !== stableJson(incoming))
        diff.push({
          path: `facts.${path}`,
          before,
          after: incoming,
          source: {
            kind: observation.source.kind,
            url: observation.source.url,
            observationId: observation.observationId,
          },
        });
      setAtPath(facts, path, incoming);
      provenance[path] = {
        observationId: observation.observationId,
        sourceKind: observation.source.kind,
        sourceUrl: observation.source.url,
        observedAt: observation.observedAt,
        priority,
      };
    }

    if (incomingTargets.length) {
      const targets = Array.isArray(facts["installTargets"])
        ? structuredClone(facts["installTargets"] as JsonRecord[])
        : [];
      incomingTargets.sort((left, right) =>
        (installTargetKey(left) ?? "").localeCompare(installTargetKey(right) ?? ""),
      );
      for (const rawIncomingTarget of incomingTargets) {
        const incomingTarget = structuredClone(rawIncomingTarget);
        const key = installTargetKey(incomingTarget);
        const provenancePath = installTargetProvenancePath(incomingTarget);
        if (!key || !provenancePath) continue;
        const targetIndex = targets.findIndex((target) => installTargetKey(target) === key);
        const before = targetIndex >= 0 ? targets[targetIndex] : undefined;
        const existing = provenance[provenancePath];
        const priority = factPriority("installTargets", observation);
        const wins = observationWins(
          existing,
          observation.observationId,
          incomingAt,
          priority,
          before === undefined ? -Infinity : (current.lastObservedAt ?? -Infinity),
        );
        if (!wins) continue;
        const nextTarget = before ? { ...before, ...incomingTarget } : incomingTarget;
        if (nextTarget["primary"] === true) {
          const primaryProvenance = provenance["installTargets.primary"];
          const hasPrimary = targets.some(
            (target, index) => index !== targetIndex && target["primary"] === true,
          );
          const primaryWins = observationWins(
            primaryProvenance,
            observation.observationId,
            incomingAt,
            priority,
            hasPrimary ? (current.lastObservedAt ?? -Infinity) : -Infinity,
          );
          if (primaryWins) {
            for (let index = 0; index < targets.length; index += 1) {
              if (index === targetIndex || targets[index]?.["primary"] !== true) continue;
              const demoted = { ...targets[index], primary: false };
              diff.push({
                path: `facts.${installTargetProvenancePath(targets[index]!)}`,
                before: targets[index],
                after: demoted,
                source: {
                  kind: observation.source.kind,
                  url: observation.source.url,
                  observationId: observation.observationId,
                },
              });
              targets[index] = demoted;
            }
            provenance["installTargets.primary"] = {
              observationId: observation.observationId,
              sourceKind: observation.source.kind,
              sourceUrl: observation.source.url,
              observedAt: observation.observedAt,
              priority,
            };
          } else nextTarget["primary"] = false;
        }
        if (stableJson(before) !== stableJson(nextTarget))
          diff.push({
            path: `facts.${provenancePath}`,
            before,
            after: nextTarget,
            source: {
              kind: observation.source.kind,
              url: observation.source.url,
              observationId: observation.observationId,
            },
          });
        if (targetIndex >= 0) targets[targetIndex] = nextTarget;
        else targets.push(nextTarget);
        provenance[provenancePath] = {
          observationId: observation.observationId,
          sourceKind: observation.source.kind,
          sourceUrl: observation.source.url,
          observedAt: observation.observedAt,
          priority,
        };
      }
      targets.sort((left, right) =>
        (installTargetKey(left) ?? "").localeCompare(installTargetKey(right) ?? ""),
      );
      facts["installTargets"] = targets;
    }

    if (observation.detection) {
      const currentDetectedAt =
        typeof detection?.["observedAt"] === "string"
          ? Date.parse(String(detection["observedAt"]))
          : -Infinity;
      const existingDetectionId =
        typeof detection?.["observationId"] === "string"
          ? String(detection["observationId"])
          : "legacy";
      const isCurrent =
        incomingAt > currentDetectedAt ||
        (incomingAt === currentDetectedAt &&
          observation.observationId.localeCompare(existingDetectionId) >= 0);
      if (isCurrent) {
        const nextDetection = {
          ...observation.detection,
          observationId: observation.observationId,
          observedAt: observation.observedAt,
        };
        if (stableJson(detection) !== stableJson(nextDetection))
          diff.push({ path: "detection", before: detection, after: nextDetection });
        detection = nextDetection;
      }
    }
  }

  sources.sort((left, right) => sourceKey(left).localeCompare(sourceKey(right)));
  return {
    state,
    detection,
    facts,
    sources,
    provenance,
    lastObservedAt: Math.max(current.lastObservedAt ?? -Infinity, incomingAt),
    diff,
  };
}

async function findPlugin(binding: Database, idOrSlug: string): Promise<PluginRow | null> {
  return binding.get<PluginRow>(
    parameterizedSql(
      `select id,slug,identity_key,package_name,name,description,author_handle,category,
        latest_version,compatibility_range,status,lifecycle_status,repository_url,homepage_url,
        license_spdx,created_at,updated_at from plugins where id=? or slug=? limit 1`,
      [idOrSlug, idOrSlug],
    ),
  );
}

async function findOperationalState(
  binding: Database,
  plugin: PluginRow,
): Promise<OperationalRow | null> {
  return binding.get<OperationalRow>(
    parameterizedSql("select * from plugin_operational_state where plugin_id=?", [plugin.id]),
  );
}

function fallbackOperationalState(plugin: PluginRow): OperationalRow {
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

async function projectionStatements(
  binding: Database,
  pluginId: string,
  facts: JsonRecord,
  provenance: Record<string, FieldProvenance>,
  observedAt: number,
  operationId: string,
  fallbackPackageName: string,
  fallbackVersion: string,
): Promise<BatchItem<"sqlite">[]> {
  const statements: BatchItem<"sqlite">[] = [];
  const packageFacts = jsonRecord(facts["package"]);
  const repositoryFacts = jsonRecord(facts["repository"]);
  const publisherFacts = jsonRecord(facts["publisher"]);
  const readmeFacts = jsonRecord(facts["readme"]);
  const compatibility = jsonRecord(facts["compatibility"]);
  const metrics = jsonRecord(facts["metrics"]);
  const packageName = typeof packageFacts["name"] === "string" ? packageFacts["name"] : null;
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

function publicationRequirements(
  facts: JsonRecord,
  sources: SourceSummary[],
  curation: {
    categories: string[];
    derivedFrom: string[];
    sourceReadmeHash?: string | undefined;
  } | null,
) {
  const missing: string[] = [];
  const packageFacts = jsonRecord(facts["package"]);
  if (typeof packageFacts["name"] !== "string" || !packageFacts["name"].trim())
    missing.push("name");
  if (typeof packageFacts["version"] !== "string" || !packageFacts["version"].trim())
    missing.push("version");
  if (!sources.some((source) => source.availability === "available")) missing.push("source");
  const publicSourceObserved = sources.some(
    (source) => source.kind === "github" || source.kind === "npm",
  );
  const readme = jsonRecord(facts["readme"]);
  if (
    publicSourceObserved &&
    !["available", "unavailable"].includes(String(readme["availability"]))
  )
    missing.push("readme");
  const repository = jsonRecord(facts["repository"]);
  const publisher = jsonRecord(facts["publisher"]);
  if (
    typeof repository["fullName"] === "string" &&
    (typeof publisher["githubId"] !== "string" ||
      typeof publisher["avatarUrl"] !== "string" ||
      typeof publisher["profileUrl"] !== "string")
  )
    missing.push("publisher");
  const targets = Array.isArray(facts["installTargets"])
    ? (facts["installTargets"] as JsonRecord[])
    : [];
  const primaryTargets = targets.filter(
    (target) => target["primary"] === true && target["available"] !== false,
  );
  if (primaryTargets.length !== 1) {
    missing.push("primaryInstallTarget");
  } else {
    const target = primaryTargets[0]!;
    const packageName = packageFacts["name"];
    const version = packageFacts["version"];
    const targetPackageName = target["packageName"] ?? packageName;
    const targetVersion = target["version"] ?? version;
    const exactNpm =
      target["kind"] === "npm" &&
      typeof packageName === "string" &&
      typeof version === "string" &&
      targetPackageName === packageName &&
      targetVersion === version &&
      target["spec"] === `${packageName}@${version}`;
    const fullName = repository["fullName"];
    const exactGitHub =
      target["kind"] === "github" &&
      typeof fullName === "string" &&
      typeof target["spec"] === "string" &&
      target["spec"].toLowerCase().startsWith(`github:${fullName.toLowerCase()}#`) &&
      target["spec"].slice(target["spec"].lastIndexOf("#") + 1).length > 0 &&
      !hasUnsafeInstallSpecCharacter(target["spec"]);
    if (!exactNpm && !exactGitHub) missing.push("safePrimaryInstallTarget");
  }
  if (!curation) missing.push("content");
  else {
    if (!curation.categories.length) missing.push("category");
    if (!curation.derivedFrom.length) missing.push("sourceCitation");
    if (
      readme["availability"] === "available" &&
      typeof readme["contentHash"] === "string" &&
      curation.sourceReadmeHash !== readme["contentHash"]
    )
      missing.push("readmeCuration");
  }
  return missing;
}

export async function upsertObservation(
  binding: Database,
  actorTokenId: string,
  requestId: string,
  observation: PluginObservationV1,
  dryRun = false,
): Promise<ObservationWriteResult> {
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
  if (existingObservation && existingObservation.identity_key !== identityKey)
    throw new OperationHttpError(
      409,
      "observation_identity_conflict",
      "observationId already belongs to a different identity",
      false,
      { details: { observationId: observation.observationId } },
    );
  if (existingObservation && observedAt < existingObservation.observed_at)
    return {
      identity: identityKey,
      pluginId: existingObservation.plugin_id,
      status: "unchanged",
      revision:
        (
          await binding.get<{ revision: number }>(
            parameterizedSql("select revision from plugin_operational_state where plugin_id=?", [
              existingObservation.plugin_id,
            ]),
          )
        )?.revision ?? null,
      diff: [],
    };
  const previousPayload = existingObservation
    ? parseJson<PluginObservationV1 | null>(existingObservation.payload_json, null)
    : null;
  const storedObservation = previousPayload
    ? mergeStoredObservation(previousPayload, observation)
    : observation;
  const payload = stableJson(storedObservation);
  const payloadHash = await digest(payload);
  if (existingObservation?.payload_hash === payloadHash)
    return {
      identity: identityKey,
      pluginId: existingObservation.plugin_id,
      status: "unchanged",
      revision:
        (
          await binding.get<{ revision: number }>(
            parameterizedSql("select revision from plugin_operational_state where plugin_id=?", [
              existingObservation.plugin_id,
            ]),
          )
        )?.revision ?? null,
      diff: [],
    };

  const matches = existingObservation
    ? [existingObservation.plugin_id]
    : await identityMatches(binding, observation);
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
  const afterRevision = stateRow ? state.revision + (resourceRevisionChanged ? 1 : 0) : 1;
  const status = existingObservation ? "updated" : "created";
  const operationId = crypto.randomUUID();
  const existingIdentity = await binding.get<{ plugin_id: string }>(
    parameterizedSql("select plugin_id from plugin_observation_identities where identity_key=?", [
      identityKey,
    ]),
  );
  if (existingIdentity && existingIdentity.plugin_id !== plugin.id)
    throw new OperationHttpError(
      409,
      "observation_identity_conflict",
      "Observation identity belongs to a different plugin",
      false,
      { details: { identity: identityKey, conflictingPluginId: existingIdentity.plugin_id } },
    );
  const preparedProjectionStatements = factsProjectionChanged
    ? await projectionStatements(
        binding,
        plugin.id,
        merged.facts,
        merged.provenance,
        observedAt,
        operationId,
        plugin.package_name,
        plugin.latest_version,
      )
    : [];
  if (dryRun)
    return {
      identity: identityKey,
      pluginId: newPlugin ? null : plugin.id,
      status,
      revision: afterRevision,
      diff: merged.diff,
    };

  const now = Date.now();
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
  const stateWriteIndex = statements.length;
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
  if (factsProjectionChanged) statements.push(...preparedProjectionStatements);
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
  try {
    const results = await runDrizzleBatch(binding, statements);
    if (!results[stateWriteIndex]?.meta.changes)
      throw new OperationHttpError(
        409,
        "revision_conflict",
        "Plugin changed while applying the observation",
        true,
        { repairHint: "Run plugin get and retry the observation." },
      );
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
      const winner = await binding.get<{
        plugin_id: string;
        identity_key: string;
        payload_hash: string;
      }>(
        parameterizedSql(
          `select plugin_id,identity_key,payload_hash from plugin_observations
           where observation_id=?`,
          [observation.observationId],
        ),
      );
      if (winner?.identity_key === identityKey && winner.payload_hash === payloadHash)
        return {
          identity: identityKey,
          pluginId: winner.plugin_id,
          status: "unchanged",
          revision:
            (
              await binding.get<{ revision: number }>(
                parameterizedSql(
                  "select revision from plugin_operational_state where plugin_id=?",
                  [winner.plugin_id],
                ),
              )
            )?.revision ?? null,
          diff: [],
        };
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
  return {
    identity: identityKey,
    pluginId: plugin.id,
    status,
    revision: afterRevision,
    diff: merged.diff,
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

function sourceStale(sources: SourceSummary[], now = Date.now()): boolean {
  return (
    sources.length === 0 ||
    sources.every((source) => now - Date.parse(source.lastObservedAt) > SOURCE_STALE_MS)
  );
}

function riskSignals(
  facts: JsonRecord,
  sources: SourceSummary[],
  hasContent: boolean,
  identityConflict: boolean,
  unavailableTargetCount = 0,
) {
  const risks = new Set<string>(["runtime-not-verified"]);
  const compatibility = jsonRecord(facts["compatibility"]);
  const declared =
    typeof compatibility["declaredRange"] === "string" ? compatibility["declaredRange"].trim() : "";
  if (!declared || declared === "*") risks.add("compatibility-not-declared");
  else if (
    !validRange(declared, { includePrerelease: true }) ||
    !satisfies(CURRENT_DSH_VERSION, declared, { includePrerelease: true })
  )
    risks.add("declared-range-mismatch");
  const repository = jsonRecord(facts["repository"]);
  const packageFacts = jsonRecord(facts["package"]);
  if (repository["archived"] === true) risks.add("repository-archived");
  if (repository["disabled"] === true) risks.add("repository-disabled");
  if (packageFacts["deprecated"] === true) risks.add("package-deprecated");
  const targets = Array.isArray(facts["installTargets"])
    ? (facts["installTargets"] as JsonRecord[])
    : [];
  if (unavailableTargetCount > 0 || targets.some((target) => target["available"] === false))
    risks.add("install-target-unavailable");
  if (sourceStale(sources)) risks.add("source-stale");
  if (
    !hasContent ||
    typeof packageFacts["name"] !== "string" ||
    typeof packageFacts["version"] !== "string" ||
    (typeof packageFacts["repositoryUrl"] !== "string" &&
      typeof repository["fullName"] !== "string")
  )
    risks.add("metadata-incomplete");
  if (identityConflict) risks.add("identity-conflict");
  return [...risks].sort();
}

function needsFor(facts: JsonRecord, sources: SourceSummary[], curation: unknown, risks: string[]) {
  const needs: string[] = [];
  const curationFacts = jsonRecord(curation);
  if (sourceStale(sources)) needs.push("refresh");
  const readme = jsonRecord(facts["readme"]);
  const publicSourceObserved = sources.some(
    (source) => source.kind === "github" || source.kind === "npm",
  );
  if (
    publicSourceObserved &&
    !["available", "unavailable"].includes(String(readme["availability"]))
  )
    needs.push("readme");
  if (
    !curation ||
    (readme["availability"] === "available" &&
      typeof readme["contentHash"] === "string" &&
      curationFacts["sourceReadmeHash"] !== readme["contentHash"])
  )
    needs.push("content");
  if (sources.length === 0 || sources.every((source) => source.availability === "unavailable"))
    needs.push("source");
  const packageFacts = jsonRecord(facts["package"]);
  const repository = jsonRecord(facts["repository"]);
  const publisher = jsonRecord(facts["publisher"]);
  if (
    typeof repository["fullName"] === "string" &&
    (typeof publisher["githubId"] !== "string" ||
      typeof publisher["avatarUrl"] !== "string" ||
      typeof publisher["profileUrl"] !== "string")
  )
    needs.push("publisher");
  if (
    typeof packageFacts["name"] !== "string" ||
    typeof packageFacts["version"] !== "string" ||
    risks.includes("identity-conflict")
  )
    needs.push("metadata");
  const targets = Array.isArray(facts["installTargets"])
    ? (facts["installTargets"] as JsonRecord[])
    : [];
  if (
    targets.filter((target) => target["primary"] === true && target["available"] !== false)
      .length !== 1
  )
    needs.push("target");
  return needs;
}

type OpsListRow = PluginRow &
  OperationalRow & {
    has_curation: number;
    source_readme_hash: string | null;
    ready_locale_count: number;
    unavailable_target_count: number;
    identity_conflict: number;
  };

function summarizePluginRow(row: OpsListRow) {
  const facts = parseJson<JsonRecord>(row.facts_json, {});
  const sources = parseJson<SourceSummary[]>(row.sources_json, []);
  const curation =
    row.has_curation === 1
      ? { ...(row.source_readme_hash ? { sourceReadmeHash: row.source_readme_hash } : {}) }
      : row.ready_locale_count >= 2
        ? {}
        : null;
  const hasContent = Boolean(curation);
  const risks = riskSignals(
    facts,
    sources,
    hasContent,
    row.identity_conflict === 1,
    row.unavailable_target_count,
  );
  const needs = needsFor(facts, sources, curation, risks);
  const publicState: "hidden" | "draft" | "published" =
    row.visibility === "hidden" ? "hidden" : row.state;
  return {
    id: row.id,
    slug: row.slug,
    identity: row.identity_key,
    state: publicState,
    visibility: row.visibility,
    revision: row.revision,
    lastObservedAt: row.last_observed_at ? new Date(row.last_observed_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
    needs,
    riskSignals: risks,
    sources,
  };
}

async function scanPluginRows(binding: Database, start: [number, string] | null, limit: number) {
  return binding.all<OpsListRow>(
    parameterizedSql(
      `select p.id,p.slug,p.identity_key,p.package_name,p.name,p.description,p.author_handle,
        p.category,p.latest_version,p.compatibility_range,p.status,p.lifecycle_status,
        p.repository_url,p.homepage_url,p.license_spdx,p.created_at,
        o.plugin_id,o.state,o.visibility,o.revision,o.detection_json,o.facts_json,o.sources_json,
        o.field_provenance_json,o.visibility_reason,o.visibility_changed_at,o.last_observed_at,
        o.created_at operational_created_at,o.updated_at,
        case when c.plugin_id is null then 0 else 1 end has_curation,
        c.source_readme_hash,
        (select count(*) from plugin_localizations l where l.plugin_id=p.id and l.translation_status='ready') ready_locale_count,
        (select count(*) from plugin_install_targets t where t.plugin_id=p.id and t.status='unavailable') unavailable_target_count,
        case when exists(
          select 1 from plugin_operational_state other
          where other.plugin_id<>p.id
            and json_extract(o.facts_json,'$.package.name') is not null
            and json_extract(other.facts_json,'$.package.name')=
                json_extract(o.facts_json,'$.package.name')
        ) then 1 else 0 end identity_conflict
       from plugins p join plugin_operational_state o on o.plugin_id=p.id
       left join plugin_curations c on c.plugin_id=p.id
       where (? is null or o.updated_at < ? or (o.updated_at=? and p.id<?))
       order by o.updated_at desc,p.id desc limit ?`,
      [start?.[0] ?? null, start?.[0] ?? null, start?.[0] ?? null, start?.[1] ?? null, limit],
    ),
  );
}

export async function listOpsPlugins(binding: Database, query: OpsPluginListQuery) {
  let scanCursor = decodeCursor(query.cursor);
  const matches: Array<ReturnType<typeof summarizePluginRow>> = [];
  let exhausted = false;
  while (matches.length <= query.limit && !exhausted) {
    const page = await scanPluginRows(binding, scanCursor, Math.max(100, query.limit * 2));
    const rows = page;
    exhausted = rows.length < Math.max(100, query.limit * 2);
    for (const row of rows) {
      scanCursor = [row.updated_at, row.id];
      const item = summarizePluginRow(row);
      if (query.state?.length && !query.state.includes(item.state)) continue;
      if (query.needs?.length && !query.needs.some((need) => item.needs.includes(need))) continue;
      if (
        query.source?.length &&
        !query.source.some((kind) => item.sources.some((source) => source.kind === kind))
      )
        continue;
      if (query.risk?.length && !query.risk.some((risk) => item.riskSignals.includes(risk)))
        continue;
      if (
        query.observedBefore &&
        item.lastObservedAt &&
        Date.parse(item.lastObservedAt) >= Date.parse(query.observedBefore)
      )
        continue;
      if (query.observedBefore && !item.lastObservedAt) continue;
      if (query.updatedBefore && Date.parse(item.updatedAt) >= Date.parse(query.updatedBefore))
        continue;
      matches.push(item);
      if (matches.length > query.limit) break;
    }
    if (!rows.length) exhausted = true;
  }
  const items = matches.slice(0, query.limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      matches.length > query.limit && last
        ? encodeCursor(Date.parse(last.updatedAt), last.id)
        : null,
  };
}

async function readCuration(binding: Database, pluginId: string) {
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

export async function getOpsPlugin(binding: Database, idOrSlug: string) {
  const plugin = await findPlugin(binding, idOrSlug);
  if (!plugin)
    throw new OperationHttpError(404, "plugin_not_found", "Plugin not found", false, {
      repairHint: "Run plugin list to resolve the current plugin id or slug.",
    });
  const state = (await findOperationalState(binding, plugin)) ?? fallbackOperationalState(plugin);
  const facts = parseJson<JsonRecord>(state.facts_json, {});
  const sources = parseJson<SourceSummary[]>(state.sources_json, []);
  const curation = await readCuration(binding, plugin.id);
  const [identities, targets, media, audit] = await Promise.all([
    binding.all<{ identity_key: string; kind: string; identity_json: string }>(
      parameterizedSql(
        "select identity_key,kind,identity_json from plugin_observation_identities where plugin_id=? order by created_at",
        [plugin.id],
      ),
    ),
    binding.all<Record<string, unknown>>(
      parameterizedSql(
        `select kind,spec,package_path packagePath,package_name packageName,version,is_primary isPrimary,status,
          verified_at observedAt from plugin_install_targets where plugin_id=?
         order by is_primary desc,updated_at desc`,
        [plugin.id],
      ),
    ),
    binding.all<Record<string, unknown>>(
      parameterizedSql(
        `select m.id,m.kind,m.sha256,m.content_type contentType,m.width,m.height,m.byte_size byteSize,
          m.status,m.created_at createdAt,
          (select json_group_object(locale,alt_text) from plugin_media_localizations l where l.media_id=m.id) altText
         from plugin_media m where m.plugin_id=? order by m.sort_order,m.created_at`,
        [plugin.id],
      ),
    ),
    binding.all<Record<string, unknown>>(
      parameterizedSql(
        `select id,request_id requestId,actor_token_id actorTokenId,action,resource_type resourceType,
          resource_id resourceId,before_revision beforeRevision,after_revision afterRevision,
          details_json details,created_at createdAt
         from plugin_operation_audit where plugin_id=? order by created_at desc limit 20`,
        [plugin.id],
      ),
    ),
  ]);
  const risks = riskSignals(
    facts,
    sources,
    Boolean(curation),
    false,
    targets.filter((target) => target["status"] === "unavailable").length,
  );
  return {
    id: plugin.id,
    slug: plugin.slug,
    identity: plugin.identity_key,
    identities: identities.map((entry) => ({
      key: entry.identity_key,
      ...parseJson(entry.identity_json, { kind: entry.kind }),
    })),
    state: state.state,
    visibility: {
      state: state.visibility,
      reason: state.visibility_reason,
      changedAt: state.visibility_changed_at
        ? new Date(state.visibility_changed_at).toISOString()
        : null,
    },
    revision: state.revision,
    lastObservedAt: state.last_observed_at ? new Date(state.last_observed_at).toISOString() : null,
    evidence: parseJson(state.detection_json, null),
    sources,
    facts,
    installTargets:
      Array.isArray(facts["installTargets"]) && facts["installTargets"].length
        ? facts["installTargets"]
        : targets.map((target) => ({
            ...target,
            primary: Boolean(target["isPrimary"]),
            available: target["status"] !== "unavailable",
            observedAt: target["observedAt"]
              ? new Date(Number(target["observedAt"])).toISOString()
              : null,
          })),
    curation,
    riskSignals: risks,
    needs: needsFor(facts, sources, curation, risks),
    media: media.map((entry) => ({
      ...entry,
      altText: parseJson(entry["altText"], {}),
      createdAt: new Date(Number(entry["createdAt"])).toISOString(),
    })),
    recentAudit: audit.map((entry) => ({
      ...entry,
      details: parseJson(entry["details"], {}),
      createdAt: new Date(Number(entry["createdAt"])).toISOString(),
    })),
  };
}

export async function curatePlugin(
  binding: Database,
  actorTokenId: string,
  requestId: string,
  idOrSlug: string,
  content: PluginCurationContent,
  ifRevision?: number,
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
  const before = await readCuration(binding, plugin.id);
  const hasStoredCuration = Boolean(
    await binding.get(
      parameterizedSql("select 1 from plugin_curations where plugin_id=?", [plugin.id]),
    ),
  );
  if (
    hasStoredCuration &&
    stableJson(before && { ...before, updatedAt: undefined }) === stableJson(content)
  )
    return { status: "unchanged", pluginId: plugin.id, revision: state.revision, content: before };
  const nextRevision = state.revision + 1;
  const now = Date.now();
  const operationId = crypto.randomUUID();
  const sourceHash = await digest(stableJson(content));
  const nextState =
    state.state === "published" ||
    publicationRequirements(
      parseJson<JsonRecord>(state.facts_json, {}),
      parseJson<SourceSummary[]>(state.sources_json, []),
      content,
    ).length === 0
      ? "published"
      : "draft";
  const statements: BatchItem<"sqlite">[] = [];
  const stateWriteIndex = statements.length;
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
          stableJson(content.displayName),
          stableJson(content.shortDescription),
          stableJson(content.overviewMarkdown),
          content.sourceReadmeHash ?? null,
          stableJson(content.categories),
          stableJson(content.tags),
          stableJson(content.derivedFrom),
          now,
          plugin.id,
          operationId,
        ],
      ),
    ),
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
  statements.push(
    binding.run(
      parameterizedSql(
        `update plugins set name=?,description=?,category=?,
          status=case when ?='hidden' then 'archived'
            when ?='published' then 'published' else 'draft' end,
          published_at=case when ?='published' and ?='visible' then coalesce(published_at,?) else published_at end,
          first_published_at=case when ?='published' and ?='visible'
            then coalesce(first_published_at,?) else first_published_at end,
          updated_at=? where id=? and exists(
            select 1 from plugin_operational_state where plugin_id=? and last_operation_id=?
          )`,
        [
          content.displayName.en,
          content.shortDescription.en,
          content.categories[0] ?? "uncategorized",
          state.visibility,
          nextState,
          nextState,
          state.visibility,
          now,
          nextState,
          state.visibility,
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
          "plugin.curate",
          "plugin",
          plugin.id,
          plugin.id,
          state.revision,
          nextRevision,
          stableJson({ before, after: content }),
          now,
          plugin.id,
          operationId,
        ],
      ),
    ),
  );
  const results = await runDrizzleBatch(binding, statements);
  const revisionResult = results[stateWriteIndex];
  if (!revisionResult?.meta.changes)
    throw new OperationHttpError(409, "revision_conflict", "Plugin changed during curation", true, {
      repairHint: "Run plugin get, merge the latest content, and retry.",
    });
  return {
    status: "updated",
    pluginId: plugin.id,
    revision: nextRevision,
    content: { ...content, updatedAt: new Date(now).toISOString() },
  };
}

export async function setPluginVisibility(
  binding: Database,
  actorTokenId: string,
  requestId: string,
  idOrSlug: string,
  visibility: "hidden" | "visible",
  reason: string,
) {
  const plugin = await findPlugin(binding, idOrSlug);
  if (!plugin) throw new OperationHttpError(404, "plugin_not_found", "Plugin not found", false);
  const existingState = await findOperationalState(binding, plugin);
  const state = existingState ?? fallbackOperationalState(plugin);
  if (state.visibility === visibility && state.visibility_reason === reason)
    return { status: "unchanged", pluginId: plugin.id, visibility, revision: state.revision };
  const nextRevision = state.revision + 1;
  const now = Date.now();
  const operationId = crypto.randomUUID();
  const hasContent = Boolean(await readCuration(binding, plugin.id));
  const restoredStatus = state.state === "published" && hasContent ? "published" : "draft";
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
          visibility === "hidden" ? "archived" : restoredStatus,
          visibility === "hidden" ? "archived" : restoredStatus,
          now,
          visibility === "hidden" ? "archived" : restoredStatus,
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
          stableJson({ visibility, reason }),
          now,
          plugin.id,
          operationId,
        ],
      ),
    ),
  );
  const results = await runDrizzleBatch(binding, statements);
  const update = results[stateWriteIndex];
  if (!update?.meta.changes)
    throw new OperationHttpError(
      409,
      "revision_conflict",
      "Plugin changed during visibility update",
      true,
      {
        repairHint: "Run plugin get and retry the visibility change.",
      },
    );
  return { status: "updated", pluginId: plugin.id, visibility, reason, revision: nextRevision };
}

function submissionCursor(createdAt: number, id: string) {
  return encodeCursor(createdAt, id);
}

export async function listOpsSubmissions(binding: Database, query: SubmissionListQuery) {
  const cursor = decodeCursor(query.cursor);
  const statuses = query.status ?? [];
  const statusClause = statuses.length ? `status in (${statuses.map(() => "?").join(",")})` : "1=1";
  const result = await binding.all<Record<string, unknown>>(
    parameterizedSql(
      `select id,user_id userId,repository_url repositoryUrl,
        repository_full_name repositoryFullName,status,source_hash sourceHash,
        resolution_json resolution,created_at createdAt,updated_at updatedAt
       from plugin_submissions
       where ${statusClause}
         and (? is null or created_at<? or (created_at=? and id<?))
       order by created_at desc,id desc limit ?`,
      [
        ...statuses,
        cursor?.[0] ?? null,
        cursor?.[0] ?? null,
        cursor?.[0] ?? null,
        cursor?.[1] ?? null,
        query.limit + 1,
      ],
    ),
  );
  const rows = result;
  const page: Array<Record<string, unknown> & { id: string; createdAt: string }> = rows
    .slice(0, query.limit)
    .map((row) => ({
      ...row,
      id: String(row["id"]),
      resolution: parseJson(row["resolution"], null),
      createdAt: new Date(Number(row["createdAt"])).toISOString(),
      updatedAt: new Date(Number(row["updatedAt"])).toISOString(),
    }));
  const last = page.at(-1);
  return {
    items: page,
    nextCursor:
      rows.length > query.limit && last
        ? submissionCursor(Date.parse(last.createdAt), last.id)
        : null,
  };
}

export async function getOpsSubmission(binding: Database, id: string) {
  const row = await binding.get<Record<string, unknown>>(
    parameterizedSql(
      `select id,user_id userId,repository_url repositoryUrl,
        repository_full_name repositoryFullName,status,source_hash sourceHash,
        resolution_json resolution,
        created_at createdAt,updated_at updatedAt
       from plugin_submissions where id=?`,
      [id],
    ),
  );
  if (!row)
    throw new OperationHttpError(404, "submission_not_found", "Submission not found", false);
  return {
    ...row,
    resolution: parseJson(row["resolution"], null),
    createdAt: new Date(Number(row["createdAt"])).toISOString(),
    updatedAt: new Date(Number(row["updatedAt"])).toISOString(),
  };
}

export async function resolveOpsSubmission(
  binding: Database,
  actorTokenId: string,
  requestId: string,
  id: string,
  resolution: SubmissionResolution,
) {
  const current = await getOpsSubmission(binding, id);
  const existingResolution = current["resolution"];
  if (existingResolution) {
    if (stableJson(existingResolution) === stableJson(resolution))
      return { status: "unchanged", id, resolution: existingResolution };
    throw new OperationHttpError(
      409,
      "submission_resolved",
      "Submission is already resolved",
      false,
      {
        repairHint: "Run submission get and use its existing resolution.",
        details: { resolution: existingResolution },
      },
    );
  }
  if (resolution.pluginId) {
    const plugin = await findPlugin(binding, resolution.pluginId);
    if (!plugin)
      throw new OperationHttpError(404, "plugin_not_found", "Resolution plugin not found", false, {
        path: "pluginId",
      });
    if (resolution.result === "accepted") {
      const operational = await getOpsPlugin(binding, plugin.id);
      const incompleteNeeds = operational.needs.filter((need: string) =>
        ["readme", "publisher", "content", "metadata", "source", "target"].includes(need),
      );
      if (incompleteNeeds.length)
        throw new OperationHttpError(
          409,
          "submission_plugin_incomplete",
          "A submission cannot be accepted before its public source profile and bilingual curation are complete",
          true,
          {
            repairHint:
              "Refresh the source, store README and publisher facts, complete curation, then retry the resolution.",
            path: "pluginId",
            details: { pluginId: plugin.id, needs: incompleteNeeds },
          },
        );
    }
  }
  const now = Date.now();
  const result = await runDrizzleBatch(binding, [
    binding.run(
      parameterizedSql(
        "update plugin_submissions set status='resolved',resolution_json=?,updated_at=? where id=? and resolution_json is null",
        [stableJson(resolution), now, id],
      ),
    ),
    binding.run(
      parameterizedSql(
        `insert into plugin_operation_audit(
          id,request_id,actor_token_id,action,resource_type,resource_id,plugin_id,
          details_json,created_at
        ) select ?,?,?,?,?,?,?,?,? where changes()=1`,
        [
          crypto.randomUUID(),
          requestId,
          actorTokenId,
          `submission.${resolution.result}`,
          "submission",
          id,
          resolution.pluginId ?? null,
          stableJson({ resolution }),
          now,
        ],
      ),
    ),
  ]);
  if (!result[0]?.meta.changes) {
    const winner = await getOpsSubmission(binding, id);
    if (stableJson(winner["resolution"]) === stableJson(resolution))
      return { status: "unchanged", id, resolution: winner["resolution"] };
    throw new OperationHttpError(
      409,
      "submission_resolved",
      "Submission changed while resolving",
      true,
    );
  }
  return { status: "updated", id, resolution, resolvedAt: new Date(now).toISOString() };
}

export async function getOpsStatus(
  binding: Database,
  auth: { authenticated: boolean; scopes: string[] },
) {
  const rows = await binding.all<{
    state: "draft" | "published";
    visibility: "visible" | "hidden";
    facts_json: string;
    sources_json: string;
    has_curation: number;
    source_readme_hash: string | null;
    ready_locale_count: number;
    identity_conflict: number;
  }>(
    parameterizedSql(
      `with ready_localizations as (
        select plugin_id,count(*) ready_locale_count
        from plugin_localizations where translation_status='ready'
        group by plugin_id
      ), identity_conflicts as (
        select json_extract(facts_json,'$.package.name') package_name
        from plugin_operational_state
        where json_extract(facts_json,'$.package.name') is not null
        group by package_name having count(*)>1
      )
      select o.state,o.visibility,o.facts_json,o.sources_json,
        case when c.plugin_id is null then 0 else 1 end has_curation,
        c.source_readme_hash,coalesce(l.ready_locale_count,0) ready_locale_count,
        case when conflicts.package_name is null then 0 else 1 end identity_conflict
      from plugin_operational_state o
      left join plugin_curations c on c.plugin_id=o.plugin_id
      left join ready_localizations l on l.plugin_id=o.plugin_id
      left join identity_conflicts conflicts
        on conflicts.package_name=json_extract(o.facts_json,'$.package.name')`,
      [],
    ),
  );
  const items = rows.map((row) => {
    const facts = parseJson<JsonRecord>(row.facts_json, {});
    const sources = parseJson<SourceSummary[]>(row.sources_json, []);
    const curation =
      row.has_curation === 1
        ? {
            ...(row.source_readme_hash ? { sourceReadmeHash: row.source_readme_hash } : {}),
          }
        : row.ready_locale_count >= 2
          ? {}
          : null;
    return {
      state: row.visibility === "hidden" ? "hidden" : row.state,
      visibility: row.visibility,
      needs: needsFor(
        facts,
        sources,
        curation,
        row.identity_conflict === 1 ? ["identity-conflict"] : [],
      ),
      sources,
    };
  });
  const submissions = await binding.get<{ count: number }>(
    parameterizedSql("select count(*) count from plugin_submissions where status='queued'", []),
  );
  return {
    hub: { reachable: true, version: "ops-v1" },
    auth,
    catalog: {
      plugins: items.length,
      published: items.filter((item) => item.state === "published").length,
      drafts: items.filter((item) => item.state === "draft").length,
      hidden: items.filter((item) => item.visibility === "hidden").length,
      needsRefresh: items.filter((item) => item.needs.includes("refresh")).length,
      needsContent: items.filter((item) => item.needs.includes("content")).length,
      needsReadme: items.filter((item) => item.needs.includes("readme")).length,
      needsPublisher: items.filter((item) => item.needs.includes("publisher")).length,
      needsMetadata: items.filter((item) => item.needs.includes("metadata")).length,
      needsTarget: items.filter((item) => item.needs.includes("target")).length,
      sourceFailures: items.filter((item) =>
        item.sources.some((source) => source.availability === "unavailable"),
      ).length,
    },
    submissions: { queued: submissions?.count ?? 0 },
  };
}

type AuditIssue = {
  code: string;
  severity: "critical" | "warning";
  count: number;
  sampleIds: string[];
};

function issue(code: string, severity: AuditIssue["severity"], ids: string[]): AuditIssue | null {
  return ids.length ? { code, severity, count: ids.length, sampleIds: ids.slice(0, 20) } : null;
}

export async function auditOperations(
  binding: Database,
  bucket: R2Bucket | undefined,
  scope: "catalog" | "storage" | "community",
) {
  const issues: AuditIssue[] = [];
  if (scope === "catalog") {
    const states = await binding.all<{
      plugin_id: string;
      state: "draft" | "published";
      facts_json: string;
      sources_json: string;
      last_observed_at: number | null;
    }>(
      parameterizedSql(
        "select plugin_id,state,facts_json,sources_json,last_observed_at from plugin_operational_state",
        [],
      ),
    );
    const invalidUrls: string[] = [];
    const stale: string[] = [];
    const unavailableTargets: string[] = [];
    const relationErrors: string[] = [];
    for (const row of states) {
      const sources = parseJson<SourceSummary[]>(row.sources_json, []);
      if (sourceStale(sources)) stale.push(row.plugin_id);
      for (const source of sources) {
        try {
          new URL(source.url);
        } catch {
          invalidUrls.push(row.plugin_id);
        }
      }
      const facts = parseJson<JsonRecord>(row.facts_json, {});
      const targets = Array.isArray(facts["installTargets"])
        ? (facts["installTargets"] as JsonRecord[])
        : [];
      if (targets.some((target) => target["available"] === false))
        unavailableTargets.push(row.plugin_id);
      if (row.state === "published" && !parseJson(row.facts_json, null))
        relationErrors.push(row.plugin_id);
    }
    const duplicates = await binding.all<{ value: string }>(
      parameterizedSql(
        `select json_extract(facts_json,'$.package.name') value from plugin_operational_state
         where json_extract(facts_json,'$.package.name') is not null
         group by json_extract(facts_json,'$.package.name') having count(*)>1`,
        [],
      ),
    );
    const orphanObservations = await binding.all<{ id: string }>(
      parameterizedSql(
        `select o.observation_id id from plugin_observations o
         left join plugins p on p.id=o.plugin_id where p.id is null`,
        [],
      ),
    );
    const missingSearch = await binding.all<{ id: string }>(
      parameterizedSql(
        `select l.plugin_id||':'||l.locale id from plugin_localizations l
         left join plugin_search s on s.plugin_id=l.plugin_id and s.locale=l.locale
         where l.translation_status='ready' and s.plugin_id is null`,
        [],
      ),
    );
    for (const entry of [
      issue(
        "identity.duplicate",
        "critical",
        duplicates.map((row) => row.value),
      ),
      issue(
        "source.orphaned",
        "critical",
        orphanObservations.map((row) => row.id),
      ),
      issue("source.invalid_url", "critical", invalidUrls),
      issue("source.stale", "warning", stale),
      issue("install_target.unavailable", "warning", unavailableTargets),
      issue(
        "search.index_missing",
        "warning",
        missingSearch.map((row) => row.id),
      ),
      issue("catalog.relationship_invalid", "critical", relationErrors),
    ])
      if (entry) issues.push(entry);
  }
  if (scope === "storage") {
    const media = await binding.all<{ id: string; r2_key: string; sha256: string }>(
      parameterizedSql("select id,r2_key,sha256 from plugin_media where status='active'", []),
    );
    const missing: string[] = [];
    const invalidHash = media
      .filter((entry) => !/^[a-f0-9]{64}$/.test(entry.sha256))
      .map((entry) => entry.id);
    if (!bucket) missing.push(...media.map((entry) => entry.id));
    if (bucket)
      for (const entry of media) if (!(await bucket.head(entry.r2_key))) missing.push(entry.id);
    const missingAlt = await binding.all<{ id: string }>(
      parameterizedSql(
        `select m.id from plugin_media m cross join (select 'en' locale union all select 'zh') wanted
         left join plugin_media_localizations l on l.media_id=m.id and l.locale=wanted.locale
         where m.status='active' and (l.media_id is null or trim(l.alt_text)='')`,
        [],
      ),
    );
    for (const entry of [
      issue("media.ref_broken", "critical", missing),
      issue("media.hash_invalid", "critical", invalidHash),
      issue(
        "media.alt_missing",
        "warning",
        missingAlt.map((row) => row.id),
      ),
    ])
      if (entry) issues.push(entry);
  }
  if (scope === "community") {
    const orphanReports = await binding.all<{ id: string }>(
      parameterizedSql(
        `select r.id from content_reports r
         where (r.target_type='plugin' and not exists(select 1 from plugins p where p.id=r.target_id))
            or (r.target_type='review' and not exists(select 1 from plugin_reviews p where p.id=r.target_id))
            or (r.target_type='reply' and not exists(select 1 from review_replies p where p.id=r.target_id))`,
        [],
      ),
    );
    const unresolved = await binding.all<{ id: string }>(
      parameterizedSql(
        "select id from content_reports where status='open' and created_at<(unixepoch()-604800)*1000",
        [],
      ),
    );
    for (const entry of [
      issue(
        "community.relationship_invalid",
        "critical",
        orphanReports.map((row) => row.id),
      ),
      issue(
        "community.report_stale",
        "warning",
        unresolved.map((row) => row.id),
      ),
    ])
      if (entry) issues.push(entry);
  }
  return {
    scope,
    checkedAt: new Date().toISOString(),
    issues,
    summary: {
      critical: issues.filter((entry) => entry.severity === "critical").length,
      warnings: issues.filter((entry) => entry.severity === "warning").length,
    },
  };
}
