import { describe, expect, it } from "vitest";

import {
  pluginCurationContentSchema,
  pluginObservationPayloadSchema,
  pluginObservationV1Schema,
} from "../src/index.js";

const observedAt = "2026-08-27T00:00:00.000Z";

function npmObservation() {
  return {
    schemaVersion: 1 as const,
    observedAt,
    identity: { kind: "npm" as const, packageName: "@fixture/plugin" },
    source: {
      kind: "npm" as const,
      url: "https://registry.npmjs.org/%40fixture%2Fplugin",
      ref: "1.0.0",
      contentHash: "a".repeat(64),
      availability: "available" as const,
    },
  };
}

describe("the observation payload", () => {
  it("accepts a payload without an id and stores one with an id", () => {
    expect(pluginObservationPayloadSchema.parse(npmObservation()).schemaVersion).toBe(1);
    expect(() =>
      pluginObservationV1Schema.parse({ observationId: "not-a-hash", ...npmObservation() }),
    ).toThrow();
    expect(
      pluginObservationV1Schema.parse({ observationId: "b".repeat(64), ...npmObservation() }),
    ).toMatchObject({ observationId: "b".repeat(64) });
  });

  it("keeps discovery signals while accepting and stripping legacy status", () => {
    expect(
      pluginObservationPayloadSchema.parse({
        ...npmObservation(),
        detection: {
          status: "candidate",
          signals: [{ kind: "readme", value: "DeepSeek Harness" }],
        },
      }).detection,
    ).toEqual({ signals: [{ kind: "readme", value: "DeepSeek Harness" }] });
  });

  it("rejects an identity or source the server would reject", () => {
    expect(() =>
      pluginObservationPayloadSchema.parse({
        ...npmObservation(),
        identity: { kind: "npm", packageName: "Fixture-Plugin" },
      }),
    ).toThrow();
    expect(() =>
      pluginObservationPayloadSchema.parse({
        ...npmObservation(),
        source: { ...npmObservation().source, url: "ftp://example.test/plugin" },
      }),
    ).toThrow(/must use http or https/iu);
    expect(() =>
      pluginObservationPayloadSchema.parse({
        ...npmObservation(),
        facts: { package: { description: "" } },
      }),
    ).toThrow();
  });

  it("requires facts to agree with the identity", () => {
    expect(() =>
      pluginObservationPayloadSchema.parse({
        ...npmObservation(),
        facts: { package: { name: "different-package" } },
      }),
    ).toThrow("must match the npm identity");
    expect(() =>
      pluginObservationPayloadSchema.parse({
        schemaVersion: 1,
        observedAt,
        identity: { kind: "github", repositoryId: "123", fullName: "Fixture/Plugin" },
        source: {
          kind: "github",
          url: "https://github.com/Fixture/Plugin",
          availability: "available",
        },
        facts: { repository: { githubId: "999" } },
      }),
    ).toThrow("must match the GitHub identity");
  });

  it("canonicalizes the GitHub subdirectory and defaults a repository root", () => {
    const padded = pluginObservationPayloadSchema.parse({
      ...npmObservation(),
      identity: {
        kind: "github",
        repositoryId: "123",
        fullName: "Fixture/Plugin",
        subdirectory: " packages/plugin ",
      },
      source: {
        kind: "github",
        url: "https://github.com/Fixture/Plugin",
        availability: "available",
      },
    });
    expect(padded.identity).toMatchObject({ subdirectory: "packages/plugin" });
    expect(() =>
      pluginObservationPayloadSchema.parse({
        ...padded,
        identity: { ...padded.identity, subdirectory: "packages/../plugin" },
      }),
    ).toThrow("canonical relative path");
  });
});

describe("install targets in an observation", () => {
  it("rejects a duplicated target", () => {
    const target = { kind: "npm" as const, spec: "@fixture/plugin@1.0.0", packagePath: "a" };
    expect(() =>
      pluginObservationPayloadSchema.parse({
        ...npmObservation(),
        facts: { installTargets: [target, target] },
      }),
    ).toThrow("kind, spec, and packagePath must be unique");
    expect(
      pluginObservationPayloadSchema.parse({
        ...npmObservation(),
        facts: { installTargets: [target, { ...target, packagePath: "b" }] },
      }).facts?.installTargets,
    ).toHaveLength(2);
  });

  it("rejects a spec that is not safe to hand to a shell", () => {
    // The producer validates against this same schema, so an injection attempt
    // fails before it is uploaded instead of coming back as a 422 that the
    // operator has to decode.
    expect(() =>
      pluginObservationPayloadSchema.parse({
        ...npmObservation(),
        facts: {
          package: { name: "@fixture/plugin", version: "1.0.0" },
          installTargets: [
            {
              kind: "npm",
              spec: "@fixture/plugin@1.0.0 --ignore-scripts",
              packageName: "@fixture/plugin",
              version: "1.0.0",
              primary: true,
            },
          ],
        },
      }),
    ).toThrow("command-injection");
  });

  it("allows at most one primary target", () => {
    expect(() =>
      pluginObservationPayloadSchema.parse({
        ...npmObservation(),
        facts: {
          package: { name: "@fixture/plugin", version: "1.0.0" },
          installTargets: [
            {
              kind: "npm",
              spec: "@fixture/plugin@1.0.0",
              packageName: "@fixture/plugin",
              version: "1.0.0",
              primary: true,
            },
            { kind: "github", spec: "github:fixture/plugin#main", primary: true },
          ],
        },
      }),
    ).toThrow("at most one primary install target");
  });

  it("keeps a GitHub target pointed at the identity repository", () => {
    const github = {
      schemaVersion: 1 as const,
      observedAt,
      identity: { kind: "github" as const, repositoryId: "123", fullName: "Fixture/Plugin" },
      source: {
        kind: "github" as const,
        url: "https://github.com/Fixture/Plugin",
        availability: "available" as const,
      },
    };
    expect(() =>
      pluginObservationPayloadSchema.parse({
        ...github,
        facts: { installTargets: [{ kind: "github", spec: "github:other/repo#main" }] },
      }),
    ).toThrow("must match the identity repository");
    expect(
      pluginObservationPayloadSchema.parse({
        ...github,
        facts: { installTargets: [{ kind: "github", spec: "github:Fixture/Plugin#main" }] },
      }).facts?.installTargets,
    ).toHaveLength(1);
  });
});

describe("sourced evidence", () => {
  const github = {
    schemaVersion: 1 as const,
    observedAt,
    identity: { kind: "github" as const, repositoryId: "123", fullName: "Example/Plugin" },
    source: {
      kind: "github" as const,
      url: "https://github.com/Example/Plugin",
      availability: "available" as const,
    },
  };

  it("accepts an exact README and a public publisher profile", () => {
    const parsed = pluginObservationPayloadSchema.parse({
      ...github,
      facts: {
        publisher: {
          githubId: "42",
          login: "example",
          kind: "organization",
          avatarUrl: "https://avatars.githubusercontent.com/u/42?v=4",
          profileUrl: "https://github.com/example",
        },
        readme: {
          availability: "available",
          format: "markdown",
          sourceUrl: "https://github.com/Example/Plugin/blob/main/README.md",
          sourceRef: "main",
          path: "README.md",
          content: "# Example plugin\n\nProvides sourced capabilities.",
          contentHash: "a".repeat(64),
        },
      },
    });
    expect(parsed.facts?.publisher?.avatarUrl).toContain("avatars.githubusercontent.com");
    expect(parsed.facts?.readme?.contentHash).toBe("a".repeat(64));
  });

  it("refuses a README that claims to be exact without a hash", () => {
    expect(() =>
      pluginObservationPayloadSchema.parse({
        ...github,
        facts: {
          readme: {
            availability: "available",
            format: "markdown",
            sourceUrl: "https://github.com/Example/Plugin/blob/main/README.md",
            content: "missing hash",
          },
        },
      }),
    ).toThrow("available README facts require exact content and contentHash");
  });
});

describe("curation content", () => {
  const content = {
    displayName: { en: "Fixture", zh: "测试" },
    shortDescription: { en: "Fixture plugin", zh: "测试插件" },
    overviewMarkdown: { en: "Overview", zh: "概览" },
    categories: ["tools"],
    tags: ["fixture"],
    derivedFrom: ["https://example.test/readme"],
  };

  it("accepts a complete document and nothing else", () => {
    expect(pluginCurationContentSchema.parse(content)).toEqual(content);
    expect(() =>
      pluginCurationContentSchema.parse({ ...content, source: { url: "https://example.test" } }),
    ).toThrow();
  });

  it("requires at least one category and one source", () => {
    expect(() => pluginCurationContentSchema.parse({ ...content, categories: [] })).toThrow();
    expect(() => pluginCurationContentSchema.parse({ ...content, derivedFrom: [] })).toThrow();
  });

  it("rejects duplicates and non-URL sources", () => {
    expect(() =>
      pluginCurationContentSchema.parse({ ...content, tags: ["fixture", "fixture"] }),
    ).toThrow("tags must not contain duplicates");
    expect(() =>
      pluginCurationContentSchema.parse({ ...content, derivedFrom: ["local note"] }),
    ).toThrow();
  });
});
