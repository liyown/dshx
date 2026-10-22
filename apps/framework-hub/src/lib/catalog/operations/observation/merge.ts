/**
 * How a new observation combines with what the Hub already recorded.
 *
 * Everything here is data in, data out: no database handle, no clock. The
 * upsert adapter loads the stored state, calls `mergeProjection`, and writes
 * what comes back. Keeping the rule pure is what makes the recency gate, the
 * per-field source priority, and the install-target merge testable without
 * fixtures.
 */

import type { PluginObservationV1 } from "../../operations-v1.contracts";
import { stableJson, type JsonRecord } from "../../json";

export type SourceSummary = {
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

export type FieldProvenance = {
  observationId: string;
  sourceKind: PluginObservationV1["source"]["kind"];
  sourceUrl: string;
  observedAt: string;
  priority: number;
};

export type FieldDiff = {
  path: string;
  before: unknown;
  after: unknown;
  source?: {
    kind: string;
    url: string;
    observationId: string;
  };
};

export type StoredProjection = {
  state: "draft" | "published";
  detection: JsonRecord | null;
  facts: JsonRecord;
  sources: SourceSummary[];
  provenance: Record<string, FieldProvenance>;
  lastObservedAt: number | null;
};

export function mergeRecords(previous: JsonRecord, incoming: JsonRecord): JsonRecord {
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

/**
 * The observation that survives an unavailable read. A source that is down
 * says nothing about the facts it once reported, so only the source list and
 * detection move; facts stay as they were last learned.
 */
export function mergeStoredObservation(
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

export function flatten(value: unknown, prefix = "", output: Record<string, unknown> = {}) {
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

export function valueAtPath(root: JsonRecord, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as JsonRecord)[segment];
  }
  return current;
}

export function setAtPath(root: JsonRecord, path: string, value: unknown) {
  const segments = path.split(".");
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    const child = current[segment];
    if (!child || typeof child !== "object" || Array.isArray(child)) current[segment] = {};
    current = current[segment] as JsonRecord;
  }
  current[segments.at(-1)!] = structuredClone(value);
}

/**
 * Which source is allowed to speak for which fact. A pinned npm manifest is
 * what `npm install` will actually resolve, so it outranks everything; a
 * README is good enough for prose but never for a version.
 */
export function factPriority(path: string, observation: PluginObservationV1): number {
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

export function sourceKey(source: Pick<SourceSummary, "kind" | "url">): string {
  return `${source.kind}\u0000${source.url}`;
}

export function installTargetKey(target: JsonRecord): string | null {
  return typeof target["kind"] === "string" && typeof target["spec"] === "string"
    ? `${target["kind"]}\u0000${target["spec"]}\u0000${
        typeof target["packagePath"] === "string" ? target["packagePath"] : ""
      }`
    : null;
}

export function installTargetProvenancePath(target: JsonRecord): string | null {
  const key = installTargetKey(target);
  return key ? `installTargets.${encodeURIComponent(key)}` : null;
}

/**
 * Whether an incoming value may replace a stored one. Recency is an absolute
 * gate: replaying an older observation never wins, however well its source
 * ranks. Between equally recent reads, the higher-priority source wins, and a
 * tie falls to the larger observation id so replaying the same batch is
 * idempotent.
 */
export function observationWins(
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

export function mergeProjection(
  current: StoredProjection,
  observation: PluginObservationV1,
): StoredProjection & { diff: FieldDiff[] } {
  const facts = structuredClone(current.facts);
  const provenance = structuredClone(current.provenance);
  const sources = structuredClone(current.sources);
  const state = current.state;
  let detection = current.detection ? structuredClone(current.detection) : null;
  const diff: FieldDiff[] = [];
  const incomingAt = Date.parse(observation.observedAt);
  const sourceProvenance = {
    kind: observation.source.kind,
    url: observation.source.url,
    observationId: observation.observationId,
  };

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
    // A replay of the same read rewrites the same entry; only a real change
    // belongs in the diff.
    if (stableJson(existingSource) !== stableJson(nextSource))
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
      const wins = observationWins(
        existing,
        observation.observationId,
        incomingAt,
        priority,
        before === undefined ? -Infinity : (current.lastObservedAt ?? -Infinity),
      );
      if (!wins) continue;
      if (stableJson(before) !== stableJson(incoming))
        diff.push({ path: `facts.${path}`, before, after: incoming, source: sourceProvenance });
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
        // Only one target may claim to be primary, so a winning primary
        // demotes the others in the same write.
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
                source: sourceProvenance,
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
            source: sourceProvenance,
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
