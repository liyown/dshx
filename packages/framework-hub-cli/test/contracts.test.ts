import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  curationContentSchema,
  mediaInputSchema,
  observationIdFor,
  parsePluginObservation,
} from "../src/contracts.js";

const observedAt = "2026-08-27T00:00:00.000Z";

function npmObservation() {
  return {
    schemaVersion: 1,
    observedAt,
    identity: { kind: "npm", packageName: "@fixture/plugin" },
    source: {
      kind: "npm",
      url: "https://registry.npmjs.org/%40fixture%2Fplugin",
      ref: "1.0.0",
      contentHash: "a".repeat(64),
      availability: "available",
    },
    detection: {
      status: "confirmed",
      signals: [{ kind: "dsh.bundle.patch", value: "dist/plugin.patch.json" }],
    },
  };
}

describe("PluginObservationV1", () => {
  it("uses the shared canonical observation ID vector without normalizing the source URL", () => {
    const identity = {
      kind: "github" as const,
      repositoryId: "123456",
      fullName: "Example/Plugin",
      subdirectory: "packages/plugin",
    };
    const source = {
      kind: "github" as const,
      url: "https://github.com/Example/Plugin",
      ref: "main",
      etag: '"abc123"',
      contentHash: "f".repeat(64),
      availability: "available" as const,
    };
    expect(
      canonicalJson({
        identity,
        source: {
          url: source.url,
          ref: source.ref,
          fingerprint: source.etag,
        },
      }),
    ).toBe(
      '{"identity":{"fullName":"Example/Plugin","kind":"github","repositoryId":"123456","subdirectory":"packages/plugin"},"source":{"fingerprint":"\\"abc123\\"","ref":"main","url":"https://github.com/Example/Plugin"}}',
    );
    expect(observationIdFor(identity, source)).toBe(
      "68ad2432954cfd3e944fd6cbc6d1c9d55e785a684fe711afd22fe56b0d36bdf9",
    );
  });

  it("generates a stable ID and rejects an edited one", () => {
    const first = parsePluginObservation(npmObservation());
    const second = parsePluginObservation(npmObservation());
    expect(first.observationId).toBe(second.observationId);
    const error = (() => {
      try {
        parsePluginObservation({
          ...npmObservation(),
          observationId: "f".repeat(64),
        });
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toMatchObject({
      issue: { code: "observation_id_mismatch", path: "observationId" },
    });
  });

  it("keeps discovery signals while accepting and stripping legacy status", () => {
    expect(parsePluginObservation(npmObservation()).detection).toEqual({
      signals: [{ kind: "dsh.bundle.patch", value: "dist/plugin.patch.json" }],
    });
    const legacy = npmObservation();
    legacy.detection = {
      status: "candidate",
      signals: [{ kind: "readme", value: "DeepSeek Harness" }],
    };
    expect(parsePluginObservation(legacy).detection).toEqual({
      signals: [{ kind: "readme", value: "DeepSeek Harness" }],
    });
  });

  it("matches the server field and identity parity constraints", () => {
    expect(() =>
      parsePluginObservation({
        ...npmObservation(),
        identity: { kind: "npm", packageName: "Fixture-Plugin" },
      }),
    ).toThrow();
    expect(() =>
      parsePluginObservation({
        ...npmObservation(),
        source: {
          ...npmObservation().source,
          url: "ftp://example.test/plugin",
        },
      }),
    ).toThrow("HTTP or HTTPS");
    expect(() =>
      parsePluginObservation({
        ...npmObservation(),
        facts: { package: { name: "different-package" } },
      }),
    ).toThrow("must match the npm identity");
    expect(() =>
      parsePluginObservation({
        ...npmObservation(),
        facts: { package: { description: "" } },
      }),
    ).toThrow();
    const target = {
      kind: "npm",
      spec: "@fixture/plugin@1.0.0",
      packagePath: "a",
    };
    expect(() =>
      parsePluginObservation({
        ...npmObservation(),
        facts: { installTargets: [target, target] },
      }),
    ).toThrow("kind, spec, and packagePath must be unique");
    expect(
      parsePluginObservation({
        ...npmObservation(),
        facts: {
          installTargets: [target, { ...target, packagePath: "b" }],
        },
      }).facts?.installTargets,
    ).toHaveLength(2);
    expect(() =>
      parsePluginObservation({
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
    ).toThrow("command-injection structure");

    const github = parsePluginObservation({
      schemaVersion: 1,
      observedAt,
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
      facts: {
        repository: { githubId: "123", fullName: "fixture/plugin" },
      },
    });
    expect(github.identity).toMatchObject({ subdirectory: "packages/plugin" });
    expect(() =>
      parsePluginObservation({
        ...github,
        observationId: undefined,
        identity: { ...github.identity, subdirectory: "packages/../plugin" },
      }),
    ).toThrow("canonical relative path");
  });

  it("keeps curated content separate from observed facts", () => {
    const content = {
      displayName: { en: "Fixture", zh: "测试" },
      shortDescription: { en: "Fixture plugin", zh: "测试插件" },
      overviewMarkdown: { en: "Overview", zh: "概览" },
      categories: ["tools"],
      tags: ["fixture"],
      derivedFrom: ["https://example.test/readme"],
    };
    expect(curationContentSchema.parse(content)).toEqual(content);
    expect(() =>
      curationContentSchema.parse({
        ...content,
        source: { url: "https://example.test" },
      }),
    ).toThrow();
    expect(() =>
      curationContentSchema.parse({ ...content, tags: ["fixture", "fixture"] }),
    ).toThrow("tags must not contain duplicates");
    expect(() =>
      curationContentSchema.parse({ ...content, derivedFrom: ["local note"] }),
    ).toThrow();
    expect(() =>
      mediaInputSchema.parse({
        kind: "icon",
        localPath: "/tmp/icon.png",
        altText: { en: "Icon", zh: "图标" },
        caption: { en: "", zh: "说明" },
      }),
    ).toThrow();
  });
});
