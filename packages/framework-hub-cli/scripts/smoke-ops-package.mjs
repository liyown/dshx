#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageArgument = process.argv[2];
assert.ok(
  packageArgument && isAbsolute(packageArgument),
  "Usage: node smoke-ops-package.mjs /absolute/path/to/installed/package",
);
const packageDirectory = resolve(packageArgument);
const metadata = JSON.parse(
  await readFile(join(packageDirectory, "package.json"), "utf8"),
);
assert.equal(metadata.name, "@becomeopc/dshx-hub-cli");

const temporary = await realpath(
  await mkdtemp(join(tmpdir(), "dshx-ops-package-smoke-")),
);
const credential = "smoke-only-credential";
const tokenPrefix = "smoke-only-prefix";
const pluginId = "11111111-1111-4111-8111-111111111111";
const content = {
  displayName: { en: "Smoke fixture", zh: "测试插件" },
  shortDescription: { en: "Local fixture plugin", zh: "本地测试插件" },
  overviewMarkdown: { en: "A local smoke fixture.", zh: "本地安装包测试。" },
  categories: ["tools"],
  tags: ["fixture"],
  derivedFrom: ["https://example.test/readme"],
};
const requests = [];
const writes = [];
const childProcesses = new Set();
let checks = 0;
let commands = 0;
let authRequests = 0;
let challenge = false;
let report = null;
let serverError;

function envelope(data, requestId) {
  return { ok: true, data, warnings: [], meta: { requestId } };
}

function respond(response, value, requestId, status = 200) {
  response.writeHead(status, {
    "content-type": "application/json",
    "x-request-id": requestId,
  });
  response.end(JSON.stringify(value));
}

async function requestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer((request, response) => {
  void (async () => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    requests.push({ method: request.method, path });
    assert.equal(request.headers.authorization, `Bearer ${credential}`);
    if (path === "/api/cli/token" && request.method === "GET") {
      authRequests++;
      if (challenge) {
        response.writeHead(403, {
          "content-type": "text/html",
          "cf-mitigated": "challenge",
          "cf-ray": "smoke-ray",
          "x-request-id": "challenge-request",
        });
        response.end("<html>Mock Cloudflare challenge</html>");
      } else {
        respond(
          response,
          {
            user: { id: "smoke-user", login: "smoke-user", role: "admin" },
            token: {
              prefix: tokenPrefix,
              scopes: ["catalog:write"],
              expiresAt: "2099-01-01T00:00:00.000Z",
            },
          },
          `auth-${authRequests}`,
        );
      }
      return;
    }
    if (
      path === `/api/ops/v1/plugins/${pluginId}/curation` &&
      request.method === "PATCH"
    ) {
      const input = await requestJson(request);
      assert.deepEqual(input, { content, ifRevision: 1 });
      writes.push({ operation: "curate", input });
      respond(
        response,
        envelope({ status: "updated", pluginId, revision: 2 }, "curate-1"),
        "curate-1",
      );
      return;
    }
    if (path === "/api/ops/v1/reports" && request.method === "POST") {
      const input = await requestJson(request);
      assert.deepEqual(Object.keys(input).sort(), [
        "body",
        "completedAt",
        "outcome",
        "runId",
        "schemaVersion",
        "startedAt",
      ]);
      assert.equal(input.schemaVersion, 1);
      assert.equal(input.outcome, "completed");
      assert.ok(Date.parse(input.completedAt) >= Date.parse(input.startedAt));
      assert.deepEqual(input.body, {
        en: "Verified package smoke against a local fixture.",
        zh: "已通过本地模拟接口完成安装包验证。",
      });
      report = { ...input, createdAt: new Date().toISOString() };
      writes.push({ operation: "report", input });
      respond(
        response,
        envelope({ status: "created", report }, "report-publish-1"),
        "report-publish-1",
        201,
      );
      return;
    }
    if (path === "/api/ops/v1/reports" && request.method === "GET") {
      respond(response, envelope(report, "report-latest-1"), "report-latest-1");
      return;
    }
    throw new Error(`Unexpected mock request: ${request.method} ${path}`);
  })().catch((error) => {
    serverError ??= error;
    respond(
      response,
      {
        ok: false,
        error: {
          code: "mock_failure",
          message: "Mock request assertion failed.",
          retryable: false,
        },
        meta: { requestId: "mock-failure" },
      },
      "mock-failure",
      500,
    );
  });
});

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const hub = `http://127.0.0.1:${address.port}`;
  const bootstrap = join(temporary, "run-installed-cli.mjs");
  await writeFile(
    bootstrap,
    `import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
const installed = process.env.SMOKE_PACKAGE_DIRECTORY;
const moduleUrl = (name) => pathToFileURL(join(installed, "dist", name)).href;
const { setKeyringEntryFactoryForTests } = await import(moduleUrl("keychain.js"));
setKeyringEntryFactoryForTests(() => ({
  getPassword: () => "smoke-only-credential",
  setPassword: () => { throw new Error("Smoke must not save credentials"); },
  deletePassword: () => { throw new Error("Smoke must not delete credentials"); }
}));
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin !== process.env.SMOKE_HUB)
    throw new Error("Smoke permits only its localhost mock origin");
  return originalFetch(input, { ...init, redirect: "error" });
};
const { runCli } = await import(moduleUrl("cli.js"));
let stdout = "";
let stderr = "";
const code = await runCli(JSON.parse(process.argv[2]), {
  stdin: Readable.from([]),
  stdout: { write(value) { stdout += value; } },
  stderr: { write(value) { stderr += value; } }
});
process.stdout.write(JSON.stringify({ code, stdout, stderr, pid: process.pid, cwd: process.cwd() }));
process.exitCode = code;
`,
    { mode: 0o600 },
  );

  async function invoke(argv, expectedCode = 0, useHub = true) {
    commands++;
    let execution;
    try {
      execution = await execFileAsync(
        process.execPath,
        [bootstrap, JSON.stringify(useHub ? [...argv, "--hub", hub] : argv)],
        {
          cwd: temporary,
          env: {
            PATH: process.env.PATH ?? "",
            LANG: "C",
            DSHX_HUB_OPS_STATE_DIR: join(temporary, "state"),
            SMOKE_PACKAGE_DIRECTORY: packageDirectory,
            SMOKE_HUB: hub,
          },
          timeout: 15_000,
          maxBuffer: 2 * 1024 * 1024,
        },
      );
    } catch (error) {
      if (typeof error.stdout !== "string" || !error.stdout) throw error;
      execution = error;
    }
    if (serverError) throw serverError;
    assert.equal(execution.stderr, "", "Bootstrap must not write diagnostics");
    const child = JSON.parse(execution.stdout);
    childProcesses.add(child.pid);
    assert.equal(
      childProcesses.size,
      commands,
      "Every command uses a new process",
    );
    assert.equal(child.cwd, temporary, "The package runs outside a checkout");
    assert.equal(
      child.code,
      expectedCode,
      `${argv.join(" ")}: ${child.stderr}`,
    );
    assert.equal(expectedCode ? child.stdout : child.stderr, "");
    const result = JSON.parse(expectedCode ? child.stderr : child.stdout);
    assert.equal(result.ok, expectedCode === 0);
    const serialized = JSON.stringify(result);
    assert.ok(
      !serialized.includes(credential),
      "Do not expose test credentials",
    );
    assert.ok(
      !serialized.includes(tokenPrefix),
      "Do not expose token prefixes",
    );
    return result;
  }

  async function inputFile(name, input) {
    const filename = join(temporary, name);
    await writeFile(filename, JSON.stringify(input), { mode: 0o600 });
    return filename;
  }

  const surface = await invoke(["capabilities"], 0, false);
  assert.deepEqual(surface.data.package, {
    name: metadata.name,
    version: metadata.version,
  });
  assert.equal(surface.data.dailyPromptVersion, 7);
  assert.ok(
    surface.data.commands.find((entry) => entry.command === "plugin curate")
      ?.input.schema.properties.overviewMarkdown,
  );
  checks++;

  const prompt = await invoke(["ops", "prompt"], 0, false);
  assert.equal(prompt.data.promptVersion, 7);
  assert.ok(prompt.data.prompt.includes("ops begin"));
  assert.equal(requests.length, 0, "Package discovery must stay offline");
  checks++;

  const first = await invoke([
    "ops",
    "begin",
    "--expect-cli-version",
    metadata.version,
  ]);
  const firstRun = first.data.run;
  assert.ok(first.data.preflight.ready);
  assert.equal(first.data.recoveryRequired, false);
  assert.equal(authRequests, 1);
  assert.equal(
    Date.parse(firstRun.stopStartingAt) - Date.parse(firstRun.startedAt),
    50 * 60 * 1000,
  );
  assert.equal(
    Date.parse(firstRun.leaseExpiresAt) - Date.parse(firstRun.startedAt),
    60 * 60 * 1000,
  );
  checks++;

  const duplicate = await invoke(["ops", "begin"], 1);
  assert.equal(duplicate.error.code, "ops_run_active");
  assert.equal(
    authRequests,
    1,
    "Duplicate begin must not retry authentication",
  );
  assert.equal(writes.length, 0);
  checks++;

  const contentFile = await inputFile("curation.json", content);
  const curated = await invoke([
    "plugin",
    "curate",
    pluginId,
    "--if-revision",
    "1",
    "--input",
    contentFile,
    "--run-id",
    firstRun.runId,
  ]);
  assert.equal(curated.meta.requestId, "curate-1");
  assert.equal(curated.data.revision, 2);
  assert.equal(writes.length, 1);
  checks++;

  const checkpoint = {
    itemId: "github:smoke/fixture",
    stage: "curated",
    pluginId,
    requestId: curated.meta.requestId,
  };
  const checkpointFile = await inputFile("checkpoint.json", checkpoint);
  const saved = await invoke([
    "ops",
    "checkpoint",
    "--run-id",
    firstRun.runId,
    "--input",
    checkpointFile,
  ]);
  assert.equal(saved.data.checkpoints[0].itemId, checkpoint.itemId);
  assert.equal(saved.data.leaseExpiresAt, firstRun.leaseExpiresAt);
  checks++;

  const partial = await invoke([
    "ops",
    "finish",
    "--run-id",
    firstRun.runId,
    "--outcome",
    "partial",
  ]);
  assert.equal(partial.data.status, "partial");
  assert.equal(report, null, "Local finish does not publish a Hub report");
  checks++;

  const second = await invoke(["ops", "begin"]);
  const secondRun = second.data.run;
  assert.notEqual(secondRun.runId, firstRun.runId);
  assert.equal(second.data.recoveryRequired, true);
  assert.equal(second.data.previousRun.runId, firstRun.runId);
  assert.equal(second.data.previousRun.status, "partial");
  const recovered = second.data.previousRun.checkpoints[0];
  const { updatedAt, ...recoveredCheckpoint } = recovered;
  assert.ok(Number.isFinite(Date.parse(updatedAt)));
  assert.deepEqual(recoveredCheckpoint, checkpoint);
  assert.equal(authRequests, 2);
  checks++;

  const beforeRejectedWrite = requests.length;
  const staleOwner = await invoke(
    [
      "plugin",
      "curate",
      pluginId,
      "--if-revision",
      "1",
      "--input",
      contentFile,
      "--run-id",
      firstRun.runId,
    ],
    1,
  );
  assert.equal(staleOwner.error.code, "ops_run_not_owner");
  assert.equal(requests.length, beforeRejectedWrite);
  assert.equal(writes.length, 1);
  checks++;

  const reportInput = {
    runId: secondRun.runId,
    startedAt: secondRun.startedAt,
    completedAt: new Date().toISOString(),
    outcome: "completed",
    body: {
      en: "Verified package smoke against a local fixture.",
      zh: "已通过本地模拟接口完成安装包验证。",
    },
  };
  const reportFile = await inputFile("report.json", reportInput);
  const published = await invoke([
    "report",
    "publish",
    "--input",
    reportFile,
    "--run-id",
    secondRun.runId,
  ]);
  assert.equal(published.data.status, "created");
  assert.equal(published.data.report.runId, secondRun.runId);
  const confirmed = await invoke(["report", "latest"]);
  assert.deepEqual(confirmed.data, published.data.report);
  assert.equal(writes.length, 2);
  checks++;

  await invoke([
    "ops",
    "finish",
    "--run-id",
    secondRun.runId,
    "--outcome",
    "completed",
  ]);
  const completed = await invoke(["ops", "status"]);
  assert.equal(completed.data.activeRun, null);
  assert.equal(completed.data.lastRun.runId, secondRun.runId);
  assert.equal(completed.data.lastRun.status, "completed");
  assert.equal(completed.data.history.length, 2);
  checks++;

  challenge = true;
  const denied = await invoke(["ops", "begin"], 1);
  assert.equal(denied.error.code, "hub_edge_challenge");
  assert.equal(denied.error.retryable, false);
  assert.equal(denied.meta.requestId, "challenge-request");
  assert.equal(authRequests, 3);
  const requestCountAfterChallenge = requests.length;
  const blocked = await invoke(["ops", "status"]);
  assert.equal(requests.length, requestCountAfterChallenge);
  assert.equal(blocked.data.activeRun, null);
  assert.equal(blocked.data.lastRun.status, "blocked");
  assert.equal(blocked.data.lastRun.runId, denied.error.details.runId);
  assert.equal(
    blocked.data.lastRun.checkpoints[0].errorCode,
    "hub_edge_challenge",
  );
  assert.equal(
    blocked.data.lastRun.checkpoints[0].requestId,
    "challenge-request",
  );
  assert.equal(writes.length, 2, "Challenge must not cause catalog writes");
  checks++;

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      package: { name: metadata.name, version: metadata.version },
      promptVersion: 7,
      checks,
      childProcesses: childProcesses.size,
      mockRequests: requests.length,
      mockWrites: writes.length,
      externalRequests: 0,
    })}\n`,
  );
} finally {
  try {
    if (server.listening) {
      const closed = new Promise((resolveClose, rejectClose) =>
        server.close((error) => (error ? rejectClose(error) : resolveClose())),
      );
      server.closeAllConnections();
      await closed;
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
