import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertOpsRun,
  beginOpsRun,
  checkpointOpsRun,
  finishOpsRun,
  readOpsState,
  renewOpsRun,
  type OpsCheckpointInput,
} from "../src/ops-state.js";

const HUB = "https://hub.example.test";
const runNode = promisify(execFile);
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "dshx-ops-state-"));
  vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", "");
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

async function storedPaths() {
  const entries = await readdir(directory);
  expect(entries).toHaveLength(1);
  const hubDirectory = join(directory, entries[0]!);
  return { directory: hubDirectory, file: join(hubDirectory, "state.json") };
}

describe("local operations state", () => {
  it("requires explicit persistent storage and supports the dedicated environment variable", async () => {
    await expect(beginOpsRun(HUB)).rejects.toMatchObject({
      issue: { code: "ops_state_dir_required" },
    });
    vi.stubEnv("DSHX_HUB_OPS_STATE_DIR", directory);
    const begun = await beginOpsRun(HUB);
    expect((await readOpsState(HUB)).activeRun?.runId).toBe(begun.run.runId);
  });

  it("allows exactly one concurrent begin and normalizes the Hub base URL", async () => {
    const results = await Promise.allSettled([
      beginOpsRun(`${HUB}/`, directory),
      beginOpsRun(HUB, directory),
      beginOpsRun(HUB, directory),
      beginOpsRun(`${HUB}/staging`, directory),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected")
        expect(["ops_run_active", "ops_state_busy"]).toContain(
          result.reason.issue.code,
        );
    }
    const state = await readOpsState(HUB, directory);
    expect(state.activeRun?.hub).toBe(HUB);
    expect(state.history).toEqual([]);
  });

  it("rejects URLs that could persist credentials or query tokens", async () => {
    for (const hub of [
      "https://user:password@hub.example.test",
      "https://@hub.example.test",
      `${HUB}?token=secret`,
      `${HUB}#secret`,
      `${HUB}?`,
      "file:///private/tmp",
    ]) {
      await expect(beginOpsRun(hub, directory)).rejects.toMatchObject({
        issue: { code: "invalid_hub_url" },
      });
    }
    expect(await readdir(directory)).toEqual([]);
  });

  it("rejects mutations and write guards from a different owner without changing state", async () => {
    const { run } = await beginOpsRun(HUB, directory);
    const before = await readOpsState(HUB, directory);
    const otherOwner = randomUUID();
    for (const attempt of [
      () =>
        checkpointOpsRun(
          HUB,
          otherOwner,
          { itemId: "plugin-one", stage: "upserted" },
          directory,
        ),
      () => renewOpsRun(HUB, otherOwner, directory),
      () => finishOpsRun(HUB, otherOwner, "completed", directory),
      () => assertOpsRun(HUB, otherOwner, directory),
    ])
      await expect(attempt()).rejects.toMatchObject({
        issue: { code: "ops_run_not_owner" },
      });
    expect(await readOpsState(HUB, directory)).toEqual(before);
    expect((await assertOpsRun(HUB, run.runId, directory)).runId).toBe(
      run.runId,
    );
  });

  it("persists checkpoints atomically and restores them from a fresh module and process", async () => {
    const { run } = await beginOpsRun(HUB, directory);
    await checkpointOpsRun(
      HUB,
      run.runId,
      {
        itemId: "item-one",
        stage: "upserted",
        pluginId: "plugin-one",
        observationId: "observation-one",
        requestId: "request-one",
      },
      directory,
    );
    await Promise.all([
      checkpointOpsRun(
        HUB,
        run.runId,
        {
          itemId: "item-one",
          stage: "verified",
          requestId: "verification-one",
        },
        directory,
      ),
      checkpointOpsRun(
        HUB,
        run.runId,
        { itemId: "item-two", stage: "skipped", errorCode: "source_not_found" },
        directory,
      ),
    ]);
    vi.resetModules();
    const restarted = await import("../src/ops-state.js");
    const state = await restarted.readOpsState(HUB, directory);
    expect(state.activeRun?.checkpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: "item-one",
          stage: "verified",
          pluginId: "plugin-one",
          observationId: "observation-one",
          requestId: "verification-one",
        }),
        expect.objectContaining({
          itemId: "item-two",
          stage: "skipped",
          errorCode: "source_not_found",
        }),
      ]),
    );
    const paths = await storedPaths();
    const child = await runNode(process.execPath, [
      "--input-type=module",
      "-e",
      "import {readFileSync} from 'node:fs'; process.stdout.write(JSON.stringify(JSON.parse(readFileSync(process.argv[1], 'utf8'))));",
      paths.file,
    ]);
    expect(JSON.parse(child.stdout)).toEqual(state);
    expect(await readdir(paths.directory)).toEqual(["state.json"]);
    expect((await stat(paths.directory)).mode & 0o777).toBe(0o700);
    expect((await stat(paths.file)).mode & 0o777).toBe(0o600);
  });

  it("rejects arbitrary checkpoint payloads without persisting them", async () => {
    const { run } = await beginOpsRun(HUB, directory);
    await expect(
      checkpointOpsRun(
        HUB,
        run.runId,
        {
          itemId: "one",
          stage: "inspected",
          token: "secret",
        } as OpsCheckpointInput,
        directory,
      ),
    ).rejects.toMatchObject({ issue: { code: "invalid_input" } });
    expect((await readOpsState(HUB, directory)).activeRun?.checkpoints).toEqual(
      [],
    );
  });

  it("keeps the original deadline after renewals and checkpoints", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.parse("2026-09-05T00:00:00.000Z");
    vi.setSystemTime(start);
    const { run } = await beginOpsRun(HUB, directory);
    expect(run.stopStartingAt).toBe("2026-09-05T00:50:00.000Z");
    expect(run.leaseExpiresAt).toBe("2026-09-05T01:00:00.000Z");
    vi.setSystemTime(start + 55 * 60 * 1000);
    const renewed = await renewOpsRun(HUB, run.runId, directory);
    const checkpointed = await checkpointOpsRun(
      HUB,
      run.runId,
      { itemId: "one", stage: "verified" },
      directory,
    );
    expect(renewed.lastActivityAt).toBe("2026-09-05T00:55:00.000Z");
    expect(checkpointed.leaseExpiresAt).toBe(run.leaseExpiresAt);
    vi.setSystemTime(start + 60 * 60 * 1000);
    await expect(renewOpsRun(HUB, run.runId, directory)).rejects.toMatchObject({
      issue: { code: "ops_run_expired" },
    });
    await expect(assertOpsRun(HUB, run.runId, directory)).rejects.toMatchObject(
      { issue: { code: "ops_run_expired" } },
    );
  });

  it("recovers an expired run without discarding checkpoints or assuming remote writes failed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.parse("2026-09-05T00:00:00.000Z");
    vi.setSystemTime(start);
    const original = await beginOpsRun(HUB, directory);
    await checkpointOpsRun(
      HUB,
      original.run.runId,
      {
        itemId: "one",
        stage: "upserted",
        pluginId: "plugin-one",
        requestId: "write-one",
      },
      directory,
    );
    vi.setSystemTime(start + 61 * 60 * 1000);
    const recovered = await beginOpsRun(HUB, directory);
    expect(recovered.run.runId).not.toBe(original.run.runId);
    expect(recovered.run.checkpoints).toEqual([]);
    expect(recovered.recoveryRequired).toBe(true);
    expect(recovered.recoveryHint).toContain(
      "does not mean a remote write failed",
    );
    expect(recovered.previousRun).toMatchObject({
      runId: original.run.runId,
      status: "interrupted",
      checkpoints: [
        expect.objectContaining({ stage: "upserted", requestId: "write-one" }),
      ],
    });
    await expect(
      finishOpsRun(HUB, original.run.runId, "completed", directory),
    ).rejects.toMatchObject({ issue: { code: "ops_run_not_owner" } });
    expect((await readOpsState(HUB, directory)).history).toEqual([
      recovered.previousRun,
    ]);
  });

  it("retains finished runs and makes incomplete work available to the next owner", async () => {
    const original = await beginOpsRun(HUB, directory);
    await checkpointOpsRun(
      HUB,
      original.run.runId,
      { itemId: "one", stage: "curated", pluginId: "plugin-one" },
      directory,
    );
    const finished = await finishOpsRun(
      HUB,
      original.run.runId,
      "partial",
      directory,
    );
    expect((await readOpsState(HUB, directory)).activeRun).toBeNull();
    const next = await beginOpsRun(HUB, directory);
    expect(next.previousRun).toEqual(finished);
    expect(next.recoveryRequired).toBe(true);
    await finishOpsRun(HUB, next.run.runId, "completed", directory);
    const latest = await beginOpsRun(HUB, directory);
    expect(latest.recoveryRequired).toBe(false);
    expect(latest.recoveryRuns).toEqual([]);
    expect((await readOpsState(HUB, directory)).history).toHaveLength(2);
  });

  it("retains interrupted work across later blocked preflight runs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.parse("2026-09-05T00:00:00.000Z");
    vi.setSystemTime(start);
    const first = await beginOpsRun(HUB, directory);
    await checkpointOpsRun(
      HUB,
      first.run.runId,
      {
        itemId: "item-one",
        stage: "upserted",
        pluginId: "plugin-one",
        requestId: "write-one",
      },
      directory,
    );
    vi.setSystemTime(start + 61 * 60 * 1000);
    const blocked = await beginOpsRun(HUB, directory);
    await checkpointOpsRun(
      HUB,
      blocked.run.runId,
      {
        itemId: "preflight",
        stage: "skipped",
        errorCode: "hub_edge_challenge",
      },
      directory,
    );
    await finishOpsRun(HUB, blocked.run.runId, "blocked", directory);
    const resumed = await beginOpsRun(HUB, directory);
    expect(resumed.previousRun?.runId).toBe(blocked.run.runId);
    expect(resumed.recoveryRuns).toEqual([
      expect.objectContaining({
        runId: first.run.runId,
        status: "interrupted",
        checkpoints: [expect.objectContaining({ requestId: "write-one" })],
      }),
    ]);
    expect((await readOpsState(HUB, directory)).history).toContainEqual(
      expect.objectContaining({ runId: blocked.run.runId, status: "blocked" }),
    );
    expect(resumed.recoveryRequired).toBe(true);
  });

  it("isolates ownership and checkpoints between Hub origins", async () => {
    const hubs = [HUB, "https://other.example.test", "http://hub.example.test"];
    const runs = await Promise.all(
      hubs.map((hub) => beginOpsRun(hub, directory)),
    );
    await checkpointOpsRun(
      HUB,
      runs[0]!.run.runId,
      { itemId: "one", stage: "inspected" },
      directory,
    );
    expect(
      (await readOpsState(hubs[1]!, directory)).activeRun?.checkpoints,
    ).toEqual([]);
    expect(
      (await readOpsState(hubs[2]!, directory)).activeRun?.checkpoints,
    ).toEqual([]);
    await expect(
      assertOpsRun(hubs[1]!, runs[0]!.run.runId, directory),
    ).rejects.toMatchObject({ issue: { code: "ops_run_not_owner" } });
    expect(await readdir(directory)).toHaveLength(3);
  });

  it("leaves an ambiguous transaction lock untouched and returns a bounded busy error", async () => {
    await beginOpsRun(HUB, directory);
    const paths = await storedPaths();
    await mkdir(join(paths.directory, ".transaction-lock"));
    await writeFile(
      join(paths.directory, ".transaction-lock", "unknown-owner"),
      "preserve",
    );
    await expect(beginOpsRun(HUB, directory)).rejects.toMatchObject({
      issue: { code: "ops_state_busy", retryable: true },
    });
    expect(
      await readFile(
        join(paths.directory, ".transaction-lock", "unknown-owner"),
        "utf8",
      ),
    ).toBe("preserve");
    expect((await readOpsState(HUB, directory)).activeRun).not.toBeNull();
  });

  it("does not replace corrupt state or discard its evidence", async () => {
    await beginOpsRun(HUB, directory);
    const paths = await storedPaths();
    await writeFile(paths.file, "corrupt evidence");
    await expect(beginOpsRun(HUB, directory)).rejects.toMatchObject({
      issue: { code: "ops_state_invalid" },
    });
    expect(await readFile(paths.file, "utf8")).toBe("corrupt evidence");
    expect(await readdir(paths.directory)).toEqual(["state.json"]);
  });
});
