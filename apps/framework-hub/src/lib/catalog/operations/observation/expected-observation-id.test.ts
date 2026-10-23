import { pluginObservationV1Schema } from "@becomeopc/dshx-hub-contracts";
import { describe, expect, it } from "vitest";

import { expectedObservationId } from "../index";

/**
 * The server half of the shared observation id vector.
 *
 * The contracts package proves that `observationIdInput` produces the text the
 * CLI hashes; this proves the Worker's own hash primitive produces the same id
 * from it. Neither test alone would catch the two sides drifting apart.
 */
describe("expectedObservationId", () => {
  it("derives the shared id vector", async () => {
    const observation = pluginObservationV1Schema.parse({
      schemaVersion: 1,
      observationId: "0".repeat(64),
      observedAt: "2026-08-26T00:00:00.000Z",
      identity: {
        kind: "github",
        repositoryId: "123456",
        fullName: "Example/Plugin",
        subdirectory: "packages/plugin",
      },
      source: {
        kind: "github",
        url: "https://github.com/Example/Plugin",
        ref: "main",
        etag: '"abc123"',
        // The ETag wins, so this value must not change the id.
        contentHash: "ignored-because-etag-wins",
        availability: "available",
      },
    });
    expect(await expectedObservationId(observation)).toBe(
      "68ad2432954cfd3e944fd6cbc6d1c9d55e785a684fe711afd22fe56b0d36bdf9",
    );
  });
});
