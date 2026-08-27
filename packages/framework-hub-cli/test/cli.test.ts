import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCli, type CliStreams } from "../src/cli.js";
import { setKeyringEntryFactoryForTests } from "../src/keychain.js";

const originalFetch = globalThis.fetch;

function streams(input = ""): {
  streams: CliStreams;
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    streams: {
      stdin: Readable.from([input]),
      stdout: { write: (value) => stdout.push(value) },
      stderr: { write: (value) => stderr.push(value) },
    },
    stdout,
    stderr,
  };
}

function observation(packageName: string) {
  return {
    schemaVersion: 1,
    observedAt: "2026-08-27T00:00:00.000Z",
    identity: { kind: "npm", packageName },
    source: {
      kind: "npm",
      url: `https://registry.npmjs.org/${packageName}`,
      contentHash: "a".repeat(64),
      availability: "available",
    },
    detection: {
      signals: [{ kind: "dsh.bundle.patch", value: "plugin.patch.json" }],
    },
  };
}

beforeEach(() => {
  setKeyringEntryFactoryForTests(() => ({
    getPassword: () => "test-token",
    setPassword: () => undefined,
    deletePassword: () => true,
  }));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setKeyringEntryFactoryForTests();
  vi.restoreAllMocks();
});

describe("CLI dispatcher and help", () => {
  it("shows only the stateless atomic default tree", async () => {
    const io = streams();
    expect(await runCli(["--help"], io.streams)).toBe(0);
    const help = io.stdout.join("");
    expect(help).toContain("source discover|inspect");
    expect(help).toContain("plugin list|get|upsert|curate|hide|restore");
    expect(help).toContain("submission list|get|resolve");
    expect(help).not.toMatch(
      /\bsync\b|\bproposal\b|\battestation\b|\blease\b|\bcommit\b/i,
    );
  });

  it("returns a deprecated-only error for removed workflows", async () => {
    const io = streams();
    expect(await runCli(["sync", "start"], io.streams)).toBe(1);
    expect(io.stdout).toEqual([]);
    expect(JSON.parse(io.stderr.join(""))).toMatchObject({
      ok: false,
      error: { code: "deprecated_command", retryable: false },
      meta: { requestId: expect.any(String) },
    });
  });

  it("accepts stdin batches and exits 2 when only some items are rejected", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: { results: [{ identity: "npm:valid", status: "created" }] },
            warnings: [],
            meta: { requestId: "batch-request" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const io = streams(
      JSON.stringify([observation("valid"), { schemaVersion: 9 }]),
    );
    expect(
      await runCli(
        [
          "plugin",
          "upsert",
          "--input",
          "-",
          "--dry-run",
          "--hub",
          "https://hub.test",
        ],
        io.streams,
      ),
    ).toBe(2);
    const output = JSON.parse(io.stdout.join("")) as {
      ok: boolean;
      data: { results: Array<{ status: string }> };
    };
    expect(output.ok).toBe(true);
    expect(output.data.results.map(({ status }) => status)).toEqual([
      "created",
      "rejected",
    ]);
    expect(io.stderr).toEqual([]);
  });

  it("splits comma and repeated list filters before calling the Hub", async () => {
    let requested: URL | undefined;
    globalThis.fetch = vi.fn(async (input) => {
      requested = new URL(String(input));
      return new Response(
        JSON.stringify({
          ok: true,
          data: { items: [], nextCursor: null },
          warnings: [{ code: "empty", message: "No plugins matched." }],
          meta: { requestId: "list-request" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const io = streams();
    expect(
      await runCli(
        [
          "plugin",
          "list",
          "--state",
          "published,draft",
          "--state",
          "hidden",
          "--needs",
          "refresh",
          "--limit",
          "100",
          "--hub",
          "https://hub.test",
        ],
        io.streams,
      ),
    ).toBe(0);
    expect(requested?.searchParams.getAll("state")).toEqual([
      "published",
      "draft",
      "hidden",
    ]);
    expect(requested?.searchParams.getAll("needs")).toEqual(["refresh"]);
    expect(requested?.searchParams.get("limit")).toBe("100");
    expect(JSON.parse(io.stdout.join(""))).toMatchObject({
      ok: true,
      warnings: [{ code: "empty" }],
    });
  });

  it("normalizes argument failures into one stable error object", async () => {
    const io = streams();
    expect(await runCli(["plugin", "list", "--limit", "101"], io.streams)).toBe(
      1,
    );
    const failure = JSON.parse(io.stderr.join(""));
    expect(failure).toMatchObject({
      ok: false,
      error: {
        code: "invalid_limit",
        retryable: false,
        path: "--limit",
      },
    });
    expect(failure).not.toHaveProperty("errors");
  });

  it("rejects extra positionals and flags that belong to another command", async () => {
    const fetcher = vi.fn();
    globalThis.fetch = fetcher;
    const extra = streams();
    expect(await runCli(["status", "unexpected"], extra.streams)).toBe(1);
    expect(JSON.parse(extra.stderr.join(""))).toMatchObject({
      error: { code: "invalid_arguments", path: "arguments.1" },
    });

    const wrongFlag = streams();
    expect(
      await runCli(
        ["source", "inspect", "github:fixture/plugin", "--dry-run"],
        wrongFlag.streams,
      ),
    ).toBe(1);
    expect(JSON.parse(wrongFlag.stderr.join(""))).toMatchObject({
      error: { code: "invalid_arguments", path: "--dry-run" },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
