import { describe, expect, it } from "vitest";

import { pluginObservationV1Schema } from "./operations-v1.contracts";
import { expectedObservationId } from "./operations-v1.server";

const base = {
  schemaVersion: 1 as const,
  observationId: "0".repeat(64),
  observedAt: "2026-08-26T00:00:00.000Z",
  identity: {
    kind: "github" as const,
    repositoryId: "123456",
    fullName: "Example/Plugin",
    subdirectory: "packages/plugin",
  },
  source: {
    kind: "github" as const,
    url: "https://github.com/Example/Plugin",
    ref: "main",
    etag: '"abc123"',
    contentHash: "ignored-because-etag-wins",
    availability: "available" as const,
  },
};

describe("operations v1 observation contract", () => {
  it("shares the canonical observation id vector with the CLI", async () => {
    const observation = pluginObservationV1Schema.parse(base);
    expect(await expectedObservationId(observation)).toBe(
      "68ad2432954cfd3e944fd6cbc6d1c9d55e785a684fe711afd22fe56b0d36bdf9",
    );
  });

  it("accepts any plugin evidence and strips legacy detection status", () => {
    const parsed = pluginObservationV1Schema.parse({
      ...base,
      detection: {
        status: "candidate",
        signals: [{ kind: "readme", value: "DSH plugin" }],
      },
    });
    expect(parsed.detection).toEqual({
      signals: [{ kind: "readme", value: "DSH plugin" }],
    });
    expect(
      pluginObservationV1Schema.safeParse({
        ...base,
        detection: { signals: [{ kind: "dsh.bundle.patch", value: ".patches[0]" }] },
      }).success,
    ).toBe(true);
  });

  it("rejects non-canonical identities, dangerous URLs, and mismatched facts", () => {
    expect(
      pluginObservationV1Schema.safeParse({
        ...base,
        identity: { ...base.identity, subdirectory: "../plugin" },
      }).success,
    ).toBe(false);
    expect(
      pluginObservationV1Schema.safeParse({
        ...base,
        source: { ...base.source, url: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
    expect(
      pluginObservationV1Schema.safeParse({
        ...base,
        facts: { repository: { githubId: "different", fullName: "Example/Plugin" } },
      }).success,
    ).toBe(false);
    expect(
      pluginObservationV1Schema.safeParse({
        ...base,
        identity: { kind: "npm", packageName: "Uppercase-Package" },
      }).success,
    ).toBe(false);
  });

  it("uses kind, spec, and packagePath as the install target identity", () => {
    expect(
      pluginObservationV1Schema.safeParse({
        ...base,
        facts: {
          installTargets: [
            {
              kind: "github",
              spec: "github:Example/Plugin#main",
              packageName: "@example/a",
              version: "1.0.0",
              packagePath: "packages/a",
            },
            {
              kind: "github",
              spec: "github:Example/Plugin#main",
              packageName: "@example/b",
              version: "1.0.0",
              packagePath: "packages/b",
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("accepts an exact source README and public GitHub publisher profile", () => {
    const parsed = pluginObservationV1Schema.parse({
      ...base,
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
    expect(
      pluginObservationV1Schema.safeParse({
        ...base,
        facts: {
          readme: {
            availability: "available",
            format: "markdown",
            sourceUrl: "https://github.com/Example/Plugin/blob/main/README.md",
            content: "missing hash",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects command-injection structures in installation targets", () => {
    expect(
      pluginObservationV1Schema.safeParse({
        ...base,
        facts: {
          package: { name: "@example/plugin", version: "1.0.0" },
          installTargets: [
            {
              kind: "npm",
              spec: "@example/plugin@1.0.0 --ignore-scripts",
              packageName: "@example/plugin",
              version: "1.0.0",
              primary: true,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });
});
