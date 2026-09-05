import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dailyOperationsCommandContract,
  dailyOperationsPromptVersion,
} from "../../hub-ops-prompt/src/index.js";
import { runCli, type CliStreams } from "../src/cli.js";
import { setKeyringEntryFactoryForTests } from "../src/keychain.js";
import { readOpsState } from "../src/ops-state.js";

vi.mock("../src/ops-prompt.js", () => ({
  readOperationsPrompt: async () => ({
    promptVersion: 7,
    prompt: "test bundled prompt",
  }),
}));

const hub = "https://ops.test";
let stateDirectory: string;
const originalFetch = globalThis.fetch;

async function invoke(
  args: string[],
  input: string | CliStreams["stdin"] = "",
) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    stdin: typeof input === "string" ? Readable.from([input]) : input,
    stdout: { write: (value) => out.push(value) },
    stderr: { write: (value) => err.push(value) },
  });
  return {
    code,
    json: JSON.parse((out.length ? out : err).join("")),
    raw: [...out, ...err].join(""),
  };
}

function authResponse() {
  return new Response(
    JSON.stringify({
      user: { id: "operator", email: "private@example.test" },
      token: {
        prefix: "private-prefix",
        scopes: ["catalog:write"],
        expiresAt: "2027-01-01T00:00:00.000Z",
      },
    }),
    {
      headers: {
        "content-type": "application/json",
        "x-request-id": "auth-receipt",
      },
    },
  );
}

beforeEach(async () => {
  stateDirectory = await mkdtemp(join(tmpdir(), "hub-ops-cli-"));
  vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", stateDirectory);
  vi.stubEnv("DSHX_HUB_URL", hub);
  setKeyringEntryFactoryForTests(() => ({
    getPassword: () => "fixture-secret",
    setPassword: () => undefined,
    deletePassword: () => true,
  }));
  globalThis.fetch = vi.fn(async () => authResponse());
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  setKeyringEntryFactoryForTests();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  await rm(stateDirectory, { recursive: true, force: true });
});

describe("scheduled operations CLI", () => {
  it("ships a command contract compatible with the prompt without parsing help", async () => {
    const result = await invoke(["capabilities"]);
    expect(result.code).toBe(0);
    expect(result.json.data.dailyPromptVersion).toBe(
      dailyOperationsPromptVersion,
    );
    for (const contract of dailyOperationsCommandContract) {
      expect(result.json.data.commands).toContainEqual(
        expect.objectContaining({ command: contract.command }),
      );
    }
    const curate = result.json.data.commands.find(
      (entry: { command: string }) => entry.command === "plugin curate",
    );
    expect(curate.options).toContain("run-id");
    expect(curate.input.schema.required).toContain("overviewMarkdown");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("runs begin, checkpoint, finish, and a second run without losing receipts", async () => {
    const first = await invoke(["ops", "begin"]);
    expect(first.code).toBe(0);
    expect(first.raw).not.toMatch(
      /fixture-secret|private-prefix|private@example/,
    );
    const id = first.json.data.run.runId;
    expect(
      (
        await invoke(
          ["ops", "checkpoint", "--run-id", id, "--input", "-"],
          JSON.stringify({
            itemId: "npm:example",
            stage: "upserted",
            pluginId: "example-id",
            requestId: "write-receipt",
          }),
        )
      ).code,
    ).toBe(0);
    expect(
      (await invoke(["ops", "finish", "--run-id", id, "--outcome", "partial"]))
        .code,
    ).toBe(0);
    const second = await invoke(["ops", "begin"]);
    expect(second.code).toBe(0);
    expect(second.json.data.run.runId).not.toBe(id);
    expect(second.json.data.previousRun.checkpoints).toContainEqual(
      expect.objectContaining({ requestId: "write-receipt" }),
    );
    expect(second.json.data.recoveryRequired).toBe(true);
  });

  it("does not contact the Hub again when a local run is already active", async () => {
    expect((await invoke(["ops", "begin"])).code).toBe(0);
    const result = await invoke(["ops", "begin"]);
    expect(result.json.error.code).toBe("ops_run_active");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("records an edge-blocked preflight locally and releases the claim", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("<html>challenge</html>", {
          status: 403,
          headers: {
            "cf-mitigated": "challenge",
            "cf-ray": "edge-request",
            "content-type": "text/html",
          },
        }),
    );
    const result = await invoke(["ops", "begin"]);
    expect(result.code).toBe(1);
    expect(result.json.error.code).toBe("hub_edge_challenge");
    const state = await readOpsState(hub);
    expect(state.activeRun).toBeNull();
    expect(state.lastRun?.status).toBe("blocked");
    expect(state.lastRun?.checkpoints[0]?.errorCode).toBe("hub_edge_challenge");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a report for a different run before making a write", async () => {
    const begin = await invoke(["ops", "begin"]);
    const id = begin.json.data.run.runId;
    const result = await invoke(
      ["report", "publish", "--run-id", id, "--input", "-"],
      JSON.stringify({
        runId: randomUUID(),
        startedAt: begin.json.data.run.startedAt,
        completedAt: new Date().toISOString(),
        outcome: "partial",
        body: { en: "None", zh: "无" },
      }),
    );
    expect(result.json.error.code).toBe("ops_report_run_mismatch");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("rechecks ownership after a slow input stream, immediately before the request", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-05T00:00:00.000Z"));
    const begin = await invoke(["ops", "begin"]);
    const id = begin.json.data.run.runId;
    const input = (async function* () {
      vi.setSystemTime(new Date("2026-09-05T01:01:00.000Z"));
      yield JSON.stringify({
        displayName: { en: "Example", zh: "示例" },
        shortDescription: { en: "Example", zh: "示例" },
        overviewMarkdown: { en: "Example", zh: "示例" },
        categories: ["tools"],
        tags: [],
        derivedFrom: [],
      });
    })();
    const result = await invoke(
      ["plugin", "curate", "example", "--run-id", id, "--input", "-"],
      input,
    );
    expect(result.json.error.code).toBe("ops_run_expired");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("requires configured local state and rejects credential-bearing Hub URLs", async () => {
    vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", "");
    expect((await invoke(["ops", "begin"])).json.error.code).toBe(
      "ops_state_dir_required",
    );
    expect(
      (
        await invoke([
          "ops",
          "preflight",
          "--hub",
          "https://user:secret@ops.test",
        ])
      ).json.error.code,
    ).toBe("invalid_hub_url");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
