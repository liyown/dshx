import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  mediaInputSchema,
  observationIdFor,
  parsePluginObservation,
  pluginListOptionsSchema,
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

  it("accepts the id the Hub will derive", () => {
    const derived = parsePluginObservation(npmObservation()).observationId;
    expect(
      parsePluginObservation({ ...npmObservation(), observationId: derived })
        .observationId,
    ).toBe(derived);
  });

  it("keeps discovery signals while accepting and stripping legacy status", () => {
    expect(parsePluginObservation(npmObservation()).detection).toEqual({
      signals: [{ kind: "dsh.bundle.patch", value: "dist/plugin.patch.json" }],
    });
  });
});

describe("local input encodings", () => {
  it("derives media metadata from the contract and adds the local path", () => {
    const parsed = mediaInputSchema.parse({
      kind: "icon",
      localPath: "/tmp/icon.png",
      altText: { en: "Icon", zh: "图标" },
    });
    expect(parsed).toMatchObject({ localPath: "/tmp/icon.png" });
    // The wire requires these; the CLI computes them from the file it reads.
    expect(parsed).not.toHaveProperty("sourceSha256");
    expect(() =>
      mediaInputSchema.parse({
        kind: "icon",
        altText: { en: "Icon", zh: "图标" },
      }),
    ).toThrow();
    // altText is the contract's strict localized text, not a free record.
    expect(() =>
      mediaInputSchema.parse({
        kind: "icon",
        localPath: "/tmp/icon.png",
        altText: { en: "Icon", zh: "图标", fr: "Icône" },
      }),
    ).toThrow();
  });

  it("adds the CLI-only all-pages switch to the wire query filters", () => {
    expect(pluginListOptionsSchema.parse({ all: true })).toMatchObject({
      all: true,
      limit: 50,
    });
    expect(() => pluginListOptionsSchema.parse({ paginate: true })).toThrow();
  });
});
