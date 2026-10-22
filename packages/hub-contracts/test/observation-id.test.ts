import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  observationIdInput,
  pluginObservationPayloadSchema,
  type ObservationIdentity,
  type ObservationSource,
} from "../src/index.js";

const identity: ObservationIdentity = {
  kind: "github",
  repositoryId: "123456",
  fullName: "Example/Plugin",
  subdirectory: "packages/plugin",
};
const source: ObservationSource = {
  kind: "github",
  url: "https://github.com/Example/Plugin",
  ref: "main",
  etag: '"abc123"',
  contentHash: "f".repeat(64),
  availability: "available",
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("observation id", () => {
  it("derives the shared id vector from the identity and the source fingerprint", () => {
    // Both sides are checked against this vector: the Hub in
    // operations-v1.contracts.test.ts, the CLI in its own contracts test.
    // Changing the canonical text must break both, not silently split them.
    expect(observationIdInput(identity, source)).toBe(
      '{"identity":{"fullName":"Example/Plugin","kind":"github","repositoryId":"123456","subdirectory":"packages/plugin"},"source":{"fingerprint":"\\"abc123\\"","ref":"main","url":"https://github.com/Example/Plugin"}}',
    );
    expect(sha256(observationIdInput(identity, source))).toBe(
      "68ad2432954cfd3e944fd6cbc6d1c9d55e785a684fe711afd22fe56b0d36bdf9",
    );
  });

  it("lets the ETag win over the content hash", () => {
    // The ETag describes the response we asked for; the content hash describes
    // whatever bytes came back. Two observations of the same ref must agree on
    // the id even when one of them happens to carry a stronger fingerprint.
    expect(observationIdInput(identity, { ...source, contentHash: "0".repeat(64) })).toBe(
      observationIdInput(identity, source),
    );
    expect(observationIdInput(identity, { ...source, etag: undefined })).not.toBe(
      observationIdInput(identity, source),
    );
  });

  it("does not normalize the source URL", () => {
    // Normalizing would make the producer and the server disagree whenever one
    // of them canonicalizes and the other does not.
    const trailing = observationIdInput(identity, {
      ...source,
      url: "https://github.com/Example/Plugin/",
    });
    expect(trailing).not.toBe(observationIdInput(identity, source));
  });

  it("hashes a repository root the same way whether or not subdirectory is sent", () => {
    const root = pluginObservationPayloadSchema.parse({
      schemaVersion: 1,
      observedAt: "2026-08-26T00:00:00.000Z",
      identity: { kind: "github", repositoryId: "1", fullName: "Example/Plugin" },
      source: {
        kind: "github",
        url: "https://github.com/Example/Plugin",
        availability: "available",
      },
    });
    expect(root.identity).toMatchObject({ subdirectory: "" });
    expect(observationIdInput(root.identity, root.source)).toBe(
      observationIdInput(
        { kind: "github", repositoryId: "1", fullName: "Example/Plugin", subdirectory: "" },
        { ...root.source },
      ),
    );
  });

  it("serializes structurally equal documents to the same string", () => {
    expect(canonicalJson({ b: 1, a: [{ d: undefined, c: 2 }] })).toBe('{"a":[{"c":2}],"b":1}');
  });
});
