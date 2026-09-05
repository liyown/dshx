import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  rmdir,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";

import { z } from "zod";

import { CliError } from "./errors.js";

const STOP_STARTING_AFTER_MS = 50 * 60 * 1000;
const RUN_DEADLINE_MS = 60 * 60 * 1000;
const TRANSACTION_ATTEMPTS = 6;
const TRANSACTION_RETRY_MS = 20;

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[^\x00-\x1f\x7f]+$/);

/** Checkpoints contain identifiers and outcomes only, never arbitrary payloads. */
export const opsCheckpointSchema = z
  .object({
    itemId: identifier,
    stage: z.enum(["inspected", "upserted", "curated", "verified", "skipped"]),
    pluginId: identifier.optional(),
    observationId: identifier.optional(),
    requestId: identifier.optional(),
    errorCode: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9_.:-]+$/)
      .optional(),
  })
  .strict();

const checkpointSchema = opsCheckpointSchema.extend({
  updatedAt: z.string().datetime(),
});
const runSchema = z
  .object({
    runId: z.string().uuid(),
    hub: z.string().url(),
    startedAt: z.string().datetime(),
    stopStartingAt: z.string().datetime(),
    leaseExpiresAt: z.string().datetime(),
    lastActivityAt: z.string().datetime(),
    status: z.enum([
      "running",
      "completed",
      "partial",
      "blocked",
      "interrupted",
    ]),
    finishedAt: z.string().datetime().optional(),
    checkpoints: z.array(checkpointSchema),
  })
  .strict();

const stateSchema = z
  .object({
    schemaVersion: z.literal(1),
    hub: z.string().url(),
    activeRun: runSchema.nullable(),
    lastRun: runSchema.nullable(),
    history: z.array(runSchema),
  })
  .strict();

export type OpsCheckpointInput = z.infer<typeof opsCheckpointSchema>;
export type OpsRun = z.infer<typeof runSchema>;
export type OpsState = z.infer<typeof stateSchema>;
export type OpsRunOutcome = "completed" | "partial" | "blocked";

function fail(
  code: string,
  message: string,
  repairHint: string,
  retryable = false,
): never {
  throw new CliError({ code, message, repairHint, retryable });
}

function location(hub: string, stateDir?: string) {
  let url: URL;
  try {
    url = new URL(hub);
  } catch {
    return fail(
      "invalid_hub_url",
      "Hub must be an absolute HTTP(S) URL.",
      "Use a Hub base URL without credentials, query parameters, or a fragment.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    hub.match(/^https?:\/+([^/?#]*)/i)?.[1]?.includes("@") ||
    hub.includes("?") ||
    hub.includes("#")
  ) {
    return fail(
      "invalid_hub_url",
      "Hub URL must not contain credentials, query parameters, or a fragment.",
      "Use a plain HTTP(S) Hub base URL; authenticate through the credential store.",
    );
  }
  // Hub requests use absolute /api paths and keyring credentials are scoped to
  // the origin. URL path aliases must therefore share the same local claim.
  const canonicalHub = url.origin;
  const directory = stateDir ?? process.env["DSHX_HUB_OPS_STATE_DIR"];
  if (!directory?.trim()) {
    return fail(
      "ops_state_dir_required",
      "An explicit operations state directory is required.",
      "Set DSHX_HUB_OPS_STATE_DIR or pass --state-dir to a persistent private directory.",
    );
  }
  const root = resolve(directory);
  const hubDirectory = join(
    root,
    createHash("sha256").update(canonicalHub).digest("hex"),
  );
  return {
    hub: canonicalHub,
    root,
    directory: hubDirectory,
    file: join(hubDirectory, "state.json"),
  };
}

type StateLocation = ReturnType<typeof location>;

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function ioFailure(error: unknown): never {
  if (error instanceof CliError) throw error;
  return fail(
    "ops_state_io_error",
    "Operations state could not be read or persisted.",
    "Check the state directory permissions and available disk space. Preserve existing state and retry only after resolving the storage error.",
  );
}

async function readState(at: StateLocation): Promise<OpsState> {
  let text: string;
  try {
    text = await readFile(at.file, "utf8");
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return {
        schemaVersion: 1,
        hub: at.hub,
        activeRun: null,
        lastRun: null,
        history: [],
      };
    }
    return ioFailure(error);
  }
  try {
    const state = stateSchema.parse(JSON.parse(text));
    const runs = [state.activeRun, state.lastRun, ...state.history].filter(
      (run): run is OpsRun => run !== null,
    );
    if (
      state.hub !== at.hub ||
      runs.some(
        (run) =>
          run.hub !== at.hub ||
          Date.parse(run.stopStartingAt) !==
            Date.parse(run.startedAt) + STOP_STARTING_AFTER_MS ||
          Date.parse(run.leaseExpiresAt) !==
            Date.parse(run.startedAt) + RUN_DEADLINE_MS,
      ) ||
      (state.activeRun !== null && state.activeRun.status !== "running") ||
      (state.lastRun !== null && state.lastRun.status === "running") ||
      state.history.some((run) => run.status === "running")
    )
      throw new Error("Invalid operations state invariants.");
    return state;
  } catch {
    return fail(
      "ops_state_invalid",
      "Existing operations state is invalid; it was left untouched.",
      "Inspect and repair or restore the state file. Do not delete checkpoints or assume that prior Hub writes failed.",
    );
  }
}

async function writeState(at: StateLocation, state: OpsState): Promise<void> {
  const temporary = join(at.directory, `.state-${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, at.file);
    const directory = await open(at.directory, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

async function transact<T>(
  at: StateLocation,
  update: (state: OpsState) => T,
): Promise<T> {
  const lock = join(at.directory, ".transaction-lock");
  let acquired = false;
  try {
    await mkdir(at.root, { recursive: true, mode: 0o700 });
    await mkdir(at.directory, { recursive: true, mode: 0o700 });
    await chmod(at.directory, 0o700);
    for (let attempt = 0; attempt < TRANSACTION_ATTEMPTS; attempt++) {
      try {
        await mkdir(lock, { mode: 0o700 });
        acquired = true;
        break;
      } catch (error) {
        if (!hasCode(error, "EEXIST")) throw error;
        if (attempt + 1 < TRANSACTION_ATTEMPTS)
          await setTimeout(TRANSACTION_RETRY_MS);
      }
    }
    if (!acquired) {
      return fail(
        "ops_state_busy",
        "Another state transaction is active or its lock requires inspection.",
        "Retry later. If this persists, verify that no process owns the transaction before manually recovering its lock; do not automatically remove it.",
        true,
      );
    }
    const state = await readState(at);
    const result = update(state);
    await writeState(at, state);
    return result;
  } catch (error) {
    return ioFailure(error);
  } finally {
    if (acquired) {
      try {
        await rmdir(lock);
      } catch (error) {
        ioFailure(error);
      }
    }
  }
}

function ownedRun(state: OpsState, runId: string, requireLive = true): OpsRun {
  const run = state.activeRun;
  if (!run || run.runId !== runId) {
    return fail(
      "ops_run_not_owner",
      "The run does not own this Hub's active lease.",
      "Read ops status and use the current run ID. A previous run must not continue Hub writes after another run takes ownership.",
    );
  }
  if (requireLive && Date.parse(run.leaseExpiresAt) <= Date.now()) {
    return fail(
      "ops_run_expired",
      "The operations run has reached its fixed deadline.",
      "Stop Hub writes. Begin a new run and reconcile saved checkpoints against Hub state before resuming.",
    );
  }
  return run;
}

/** Returns the persisted state without changing expired runs or creating a lease. */
export async function readOpsState(
  hub: string,
  stateDir?: string,
): Promise<OpsState> {
  return readState(location(hub, stateDir));
}

/** Check ownership immediately before an operation; this does not renew the lease. */
export async function assertOpsRun(
  hub: string,
  runId: string,
  stateDir?: string,
): Promise<OpsRun> {
  return ownedRun(await readOpsState(hub, stateDir), runId);
}

export async function beginOpsRun(
  hub: string,
  stateDir?: string,
): Promise<{
  run: OpsRun;
  previousRun: OpsRun | null;
  recoveryRuns: OpsRun[];
  recoveryRequired: boolean;
  recoveryHint?: string;
}> {
  const at = location(hub, stateDir);
  return transact(at, (state) => {
    const now = Date.now();
    if (state.activeRun && Date.parse(state.activeRun.leaseExpiresAt) > now) {
      return fail(
        "ops_run_active",
        "An operations run already holds this Hub's lease.",
        `Wait until ${state.activeRun.leaseExpiresAt}, or have its owner finish the run. Do not start a concurrent run.`,
        true,
      );
    }
    if (state.activeRun) {
      const previous: OpsRun = {
        ...state.activeRun,
        status: "interrupted",
        finishedAt: new Date(now).toISOString(),
      };
      state.lastRun = previous;
      state.history.push(previous);
    }
    const run: OpsRun = {
      runId: randomUUID(),
      hub: at.hub,
      startedAt: new Date(now).toISOString(),
      stopStartingAt: new Date(now + STOP_STARTING_AFTER_MS).toISOString(),
      leaseExpiresAt: new Date(now + RUN_DEADLINE_MS).toISOString(),
      lastActivityAt: new Date(now).toISOString(),
      status: "running",
      checkpoints: [],
    };
    state.activeRun = run;
    // A later preflight failure must not hide an earlier interrupted item's
    // receipts. Include the entire unfinished chain since the last completion.
    const lastCompleted = state.history.findLastIndex(
      (previous) => previous.status === "completed",
    );
    const recoveryRuns = state.history
      .slice(lastCompleted + 1)
      .filter(
        (previous) =>
          previous.status !== "blocked" ||
          previous.checkpoints.length === 0 ||
          previous.checkpoints.some(
            (checkpoint) => checkpoint.itemId !== "preflight",
          ),
      );
    const recoveryRequired = recoveryRuns.length > 0;
    return {
      run,
      previousRun: state.lastRun,
      recoveryRuns,
      recoveryRequired,
      ...(recoveryRequired
        ? {
            recoveryHint:
              "Read checkpoints from every recoveryRuns entry and verify current Hub records before resuming. An interrupted process or missing checkpoint does not mean a remote write failed.",
          }
        : {}),
    };
  });
}

export async function checkpointOpsRun(
  hub: string,
  runId: string,
  input: unknown,
  stateDir?: string,
): Promise<OpsRun> {
  const parsed = opsCheckpointSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "invalid_input",
      "Checkpoint input must contain a valid item ID, stage, and optional operation identifiers.",
      "Use only itemId, stage, pluginId, observationId, requestId, and errorCode. Never persist credentials or arbitrary request payloads.",
    );
  }
  return transact(location(hub, stateDir), (state) => {
    const run = ownedRun(state, runId);
    const index = run.checkpoints.findIndex(
      (checkpoint) => checkpoint.itemId === parsed.data.itemId,
    );
    const previous = index < 0 ? undefined : run.checkpoints[index];
    const updatedAt = new Date().toISOString();
    const checkpoint = {
      ...(previous?.pluginId ? { pluginId: previous.pluginId } : {}),
      ...(previous?.observationId
        ? { observationId: previous.observationId }
        : {}),
      ...parsed.data,
      updatedAt,
    };
    if (index < 0) run.checkpoints.push(checkpoint);
    else run.checkpoints[index] = checkpoint;
    run.lastActivityAt = updatedAt;
    return run;
  });
}

/** Records activity; the original 60-minute deadline never moves. */
export async function renewOpsRun(
  hub: string,
  runId: string,
  stateDir?: string,
): Promise<OpsRun> {
  return transact(location(hub, stateDir), (state) => {
    const run = ownedRun(state, runId);
    run.lastActivityAt = new Date().toISOString();
    return run;
  });
}

export async function finishOpsRun(
  hub: string,
  runId: string,
  outcome: OpsRunOutcome,
  stateDir?: string,
): Promise<OpsRun> {
  if (!["completed", "partial", "blocked"].includes(outcome)) {
    return fail(
      "invalid_input",
      "Run outcome must be completed, partial, or blocked.",
      "Choose one of the supported run outcomes.",
    );
  }
  return transact(location(hub, stateDir), (state) => {
    const run = ownedRun(state, runId, false);
    run.status = outcome;
    run.finishedAt = new Date().toISOString();
    run.lastActivityAt = run.finishedAt;
    state.activeRun = null;
    state.lastRun = run;
    state.history.push(run);
    return run;
  });
}
