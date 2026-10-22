import { describe, expect, it } from "vitest";

import type { JsonRecord } from "./json";
import {
  mergeProjection,
  mergeStoredObservation,
  type SourceSummary,
  type StoredProjection,
} from "./observation-merge";
import type { PluginObservationV1 } from "./operations-v1.contracts";

const T1 = "2026-10-20T00:00:00.000Z";
const T2 = "2026-10-21T00:00:00.000Z";
const T3 = "2026-10-22T00:00:00.000Z";

function npmObservation(
  observedAt: string,
  observationId: string,
  facts?: PluginObservationV1["facts"],
): PluginObservationV1 {
  return {
    schemaVersion: 1,
    observationId,
    observedAt,
    identity: { kind: "npm", packageName: "dsh-crosspost" },
    source: {
      kind: "npm",
      url: "https://registry.npmjs.org/dsh-crosspost",
      availability: "available",
    },
    ...(facts ? { facts } : {}),
  };
}

function githubObservation(
  observedAt: string,
  observationId: string,
  facts?: PluginObservationV1["facts"],
): PluginObservationV1 {
  return {
    schemaVersion: 1,
    observationId,
    observedAt,
    identity: {
      kind: "github",
      repositoryId: "123",
      fullName: "example/dsh-crosspost",
      subdirectory: "",
    },
    source: {
      kind: "github",
      url: "https://github.com/example/dsh-crosspost",
      availability: "available",
    },
    ...(facts ? { facts } : {}),
  };
}

function emptyProjection(): StoredProjection {
  return {
    state: "draft",
    detection: null,
    facts: {},
    sources: [],
    provenance: {},
    lastObservedAt: null,
  };
}

function versionOf(facts: JsonRecord): unknown {
  return (facts["package"] as JsonRecord | undefined)?.["version"];
}

describe("mergeProjection", () => {
  it("never lets an older observation replace a fact learned later", () => {
    const current: StoredProjection = {
      ...emptyProjection(),
      facts: { package: { version: "2.0.0" } },
      provenance: {
        "package.version": {
          observationId: "newer",
          sourceKind: "npm",
          sourceUrl: "https://registry.npmjs.org/dsh-crosspost",
          observedAt: T2,
          priority: 400,
        },
      },
      lastObservedAt: Date.parse(T2),
    };
    // GitHub outranks npm for package facts, but this read predates the npm one.
    const merged = mergeProjection(
      current,
      githubObservation(T1, "older", { package: { name: "dsh-crosspost", version: "1.0.0" } }),
    );
    expect(versionOf(merged.facts)).toBe("2.0.0");
    expect(merged.diff.filter((entry) => entry.path === "facts.package.version")).toEqual([]);
    expect(merged.lastObservedAt).toBe(Date.parse(T2));
  });

  it("lets the higher-priority source win when two reads are equally recent", () => {
    const fromNpm = mergeProjection(
      emptyProjection(),
      npmObservation(T2, "observation-npm", { package: { description: "npm copy" } }),
    );
    const fromGithub = mergeProjection(
      fromNpm,
      githubObservation(T2, "observation-gh", { package: { description: "github copy" } }),
    );
    expect((fromGithub.facts["package"] as JsonRecord)["description"]).toBe("npm copy");

    const githubFirst = mergeProjection(
      emptyProjection(),
      githubObservation(T2, "observation-gh", { package: { description: "github copy" } }),
    );
    const npmAfter = mergeProjection(
      githubFirst,
      npmObservation(T2, "observation-npm", { package: { description: "npm copy" } }),
    );
    expect((npmAfter.facts["package"] as JsonRecord)["description"]).toBe("npm copy");
  });

  it("records what changed when a newer read replaces a fact", () => {
    const merged = mergeProjection(
      emptyProjection(),
      npmObservation(T2, "observation-1", { package: { version: "1.0.0" } }),
    );
    const updated = mergeProjection(
      merged,
      npmObservation(T3, "observation-2", { package: { version: "2.0.0" } }),
    );
    expect(versionOf(updated.facts)).toBe("2.0.0");
    expect(updated.diff.filter((entry) => entry.path.startsWith("facts."))).toEqual([
      expect.objectContaining({ path: "facts.package.version", before: "1.0.0", after: "2.0.0" }),
    ]);
  });

  it("changes nothing when the same observation is replayed", () => {
    const observation = npmObservation(T2, "observation-1", { package: { version: "1.0.0" } });
    const once = mergeProjection(emptyProjection(), observation);
    const twice = mergeProjection(once, observation);
    expect(twice.diff).toEqual([]);
    expect(twice.facts).toEqual(once.facts);
    expect(twice.provenance).toEqual(once.provenance);
  });

  it("keeps the facts an unavailable source can no longer report", () => {
    const stored = mergeProjection(
      emptyProjection(),
      npmObservation(T2, "observation-1", { package: { version: "1.0.0" } }),
    );
    const merged = mergeProjection(stored, {
      ...npmObservation(T3, "observation-2"),
      source: {
        kind: "npm",
        url: "https://registry.npmjs.org/dsh-crosspost",
        availability: "unavailable",
      },
    });
    expect(versionOf(merged.facts)).toBe("1.0.0");
    expect(merged.sources).toEqual([
      expect.objectContaining({ availability: "unavailable", lastSuccessfulAt: T2 }),
    ]);
  });

  it("keeps both install targets and leaves exactly one primary", () => {
    const stored = mergeProjection(
      emptyProjection(),
      githubObservation(T2, "observation-gh", {
        installTargets: [
          { kind: "npm", spec: "dsh-crosspost", packageName: "dsh-crosspost", primary: true },
        ],
      }),
    );
    const merged = mergeProjection(
      stored,
      npmObservation(T3, "observation-npm", {
        package: { name: "dsh-crosspost" },
        installTargets: [
          {
            kind: "npm",
            spec: "dsh-crosspost@1.2.3",
            packageName: "dsh-crosspost",
            version: "1.2.3",
            primary: true,
          },
        ],
      }),
    );
    const targets = merged.facts["installTargets"] as JsonRecord[];
    expect(targets.map((target) => target["spec"])).toEqual([
      "dsh-crosspost",
      "dsh-crosspost@1.2.3",
    ]);
    expect(targets.filter((target) => target["primary"] === true)).toEqual([
      expect.objectContaining({ spec: "dsh-crosspost@1.2.3" }),
    ]);
  });

  it("keeps one source entry per kind and url, sorted", () => {
    const stored = mergeProjection(emptyProjection(), githubObservation(T2, "observation-gh"));
    const merged = mergeProjection(stored, npmObservation(T3, "observation-npm"));
    expect(merged.sources.map((source: SourceSummary) => source.url)).toEqual([
      "https://github.com/example/dsh-crosspost",
      "https://registry.npmjs.org/dsh-crosspost",
    ]);
  });

  it("does not rewrite the stored source from an older read of the same source", () => {
    const stored = mergeProjection(emptyProjection(), npmObservation(T3, "observation-newer"));
    const merged = mergeProjection(stored, npmObservation(T2, "observation-older"));
    expect(merged.sources).toEqual([
      expect.objectContaining({ lastObservedAt: T3, observationId: "observation-newer" }),
    ]);
  });
});

describe("mergeStoredObservation", () => {
  it("restates the previous payload when the new read is unavailable", () => {
    const previous = npmObservation(T1, "observation-1", { package: { version: "1.0.0" } });
    const merged = mergeStoredObservation(previous, {
      ...npmObservation(T2, "observation-2"),
      source: {
        kind: "npm",
        url: "https://registry.npmjs.org/dsh-crosspost",
        availability: "unavailable",
      },
    });
    expect(merged.facts).toEqual(previous.facts);
    expect(merged.observedAt).toBe(T2);
  });

  it("merges install targets by identity instead of concatenating them", () => {
    const previous = npmObservation(T1, "observation-1", {
      installTargets: [{ kind: "npm", spec: "dsh-crosspost", primary: true, available: true }],
    });
    const merged = mergeStoredObservation(
      previous,
      npmObservation(T2, "observation-2", {
        installTargets: [{ kind: "npm", spec: "dsh-crosspost", primary: true, available: false }],
      }),
    );
    expect(merged.facts?.["installTargets"]).toEqual([
      { kind: "npm", spec: "dsh-crosspost", primary: true, available: false },
    ]);
  });
});
