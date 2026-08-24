#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineCommand, parseArgs as parseCittyArgs } from "citty";

import { api } from "./api.js";
import {
  claimApprovalEffect,
  createApproval,
  reviseApproval,
  showApproval,
  submitApprovalEffectResult,
  withApprovalResume,
  waitForApproval,
} from "./approvals.js";
import { login, logout, status } from "./auth.js";
import {
  loadCatalogInventory,
  loadCatalogWorklist,
  loadContract,
  validateCatalogPage,
} from "./catalog.js";
import { issuesFrom, CliError } from "./errors.js";
import { helpText } from "./help.js";
import { runMaintenanceAudit } from "./maintenance.js";
import { checkMedia, uploadMedia } from "./media.js";
import { submitMetrics } from "./metrics.js";
import { submitTargetVerification } from "./targets.js";
import { verifyEvidenceManifest } from "./validate.js";

const hubArgs = {
  hub: { type: "string", description: "Hub base URL.", valueHint: "url" },
  input: {
    type: "string",
    description: "Read JSON input from a file or stdin.",
    valueHint: "file",
  },
  output: {
    type: "string",
    description: "Write JSON output to a file.",
    valueHint: "file",
  },
  all: { type: "boolean", description: "Process every available page." },
  help: { type: "boolean", alias: "h", description: "Show command help." },
  version: {
    type: "boolean",
    alias: "V",
    description: "Show the installed version.",
  },
  confidence: { type: "string", valueHint: "number" },
  cursor: { type: "string", valueHint: "cursor" },
  decisionCode: { type: "string", valueHint: "code" },
  error: { type: "string", valueHint: "message" },
  expected: { type: "string", valueHint: "count" },
  expires: { type: "string", valueHint: "timestamp" },
  id: { type: "string", valueHint: "id" },
  idempotencyKey: { type: "string", valueHint: "key" },
  kind: { type: "string", valueHint: "kind" },
  lease: { type: "string", valueHint: "token" },
  limit: { type: "string", valueHint: "count" },
  mode: { type: "string", valueHint: "mode" },
  policyVersion: { type: "string", valueHint: "version" },
  reason: { type: "string", valueHint: "text" },
  reports: { type: "string", valueHint: "ids" },
  role: { type: "string", valueHint: "role" },
  run: { type: "string", valueHint: "id" },
  scope: { type: "string", valueHint: "scope" },
  scopes: { type: "string", valueHint: "scopes" },
  status: { type: "string", valueHint: "status" },
  target: { type: "string", valueHint: "id" },
  timeout: { type: "string", valueHint: "seconds" },
  type: { type: "string", valueHint: "type" },
  user: { type: "string", valueHint: "id" },
} as const;

const leaf = (name: string, description: string) =>
  defineCommand({ meta: { name, description }, args: hubArgs });

/** Citty command metadata for the complete published Hub operations surface. */
export const hubCliCommand = defineCommand({
  meta: {
    name: "dshx-hub",
    description:
      "Operate the verified DSHX community Hub with stable JSON contracts.",
  },
  args: hubArgs,
  subCommands: {
    auth: defineCommand({
      meta: { name: "auth", description: "Manage Hub authentication." },
      args: hubArgs,
      subCommands: {
        login: leaf(
          "login",
          "Authorize through the browser and store a revocable token.",
        ),
        status: leaf("status", "Validate the current Hub token."),
        logout: leaf("logout", "Revoke and delete the current Hub token."),
      },
    }),
    contract: defineCommand({
      meta: { name: "contract", description: "Read live Hub contracts." },
      args: hubArgs,
      subCommands: { show: leaf("show", "Read a versioned input contract.") },
    }),
    catalog: defineCommand({
      meta: {
        name: "catalog",
        description: "Inspect and verify catalog data.",
      },
      args: hubArgs,
      subCommands: {
        inventory: leaf("inventory", "Read published catalog identities."),
        worklist: leaf("worklist", "Read pending catalog work."),
        verify: leaf("verify", "Verify a local package evidence manifest."),
        check: leaf("check", "Validate a catalog proposal page."),
      },
    }),
    sync: defineCommand({
      meta: {
        name: "sync",
        description: "Manage recoverable catalog staging runs.",
      },
      args: hubArgs,
      subCommands: Object.fromEntries(
        ["start", "put", "preview", "commit", "resume", "abort"].map((name) => [
          name,
          leaf(name, `Run catalog sync ${name}.`),
        ]),
      ),
    }),
    metrics: defineCommand({
      meta: { name: "metrics", description: "Submit sourced metrics." },
      args: hubArgs,
      subCommands: { submit: leaf("submit", "Submit metric observations.") },
    }),
    targets: defineCommand({
      meta: {
        name: "targets",
        description: "Submit installation target evidence.",
      },
      args: hubArgs,
      subCommands: {
        submit: leaf("submit", "Submit target verification results."),
      },
    }),
    media: defineCommand({
      meta: { name: "media", description: "Check and upload verified media." },
      args: hubArgs,
      subCommands: {
        check: leaf("check", "Validate local media evidence."),
        upload: leaf("upload", "Upload verified local media."),
      },
    }),
    maintenance: defineCommand({
      meta: { name: "maintenance", description: "Audit Hub consistency." },
      args: hubArgs,
      subCommands: { audit: leaf("audit", "Run a Hub maintenance audit.") },
    }),
    moderation: defineCommand({
      meta: {
        name: "moderation",
        description: "Review and moderate Hub content.",
      },
      args: hubArgs,
      subCommands: Object.fromEntries(
        [
          "queue",
          "hide",
          "restore",
          "dismiss",
          "restrict",
          "unrestrict",
          "ban",
          "unban",
        ].map((name) => [name, leaf(name, `Run moderation ${name}.`)]),
      ),
    }),
    approvals: defineCommand({
      meta: { name: "approvals", description: "Manage approval workflows." },
      args: hubArgs,
      subCommands: Object.fromEntries(
        [
          "create",
          "show",
          "wait",
          "revise",
          "claim-effect",
          "effect-result",
        ].map((name) => [name, leaf(name, `Run approval ${name}.`)]),
      ),
    }),
    users: defineCommand({
      meta: { name: "users", description: "Manage Hub users." },
      args: hubArgs,
      subCommands: {
        role: defineCommand({
          meta: { name: "role", description: "Manage user roles." },
          args: hubArgs,
          subCommands: {
            set: leaf("set", "Set a user role through approval."),
          },
        }),
      },
    }),
  },
});

const parsedArgs = parseCittyArgs(process.argv.slice(2), hubArgs);
const args = parsedArgs._;
const group = args[0];
const command = args[1];
const option = (name: string, fallback?: string) => {
  const value = parsedArgs[name.slice(2)];
  return typeof value === "string" && value !== "" ? value : fallback;
};
const flag = (name: string) => parsedArgs[name.slice(2)] === true;
const hub = option(
  "--hub",
  process.env["DSHX_HUB_URL"] ?? "https://dshx.io",
)!.replace(/\/$/, "");
const json = (value: unknown, stream: NodeJS.WriteStream = process.stdout) =>
  stream.write(`${JSON.stringify(value, null, 2)}\n`);

async function stdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonInput(path = option("--input", "-")!) {
  return JSON.parse(
    path === "-" ? await stdin() : await readFile(resolve(path), "utf8"),
  ) as unknown;
}

async function output(value: unknown) {
  const path = option("--output");
  if (path)
    await writeFile(resolve(path), `${JSON.stringify(value, null, 2)}\n`);
  else json(value);
}

async function cliVersion() {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version?: string };
  return packageJson.version ?? "unknown";
}

function requireOption(name: string): string {
  const value = option(name);
  if (!value)
    throw new CliError({
      code: "missing_option",
      stage: "cli",
      path: name,
      message: `${name} is required.`,
      retryable: false,
      repairHint: `Run this command with ${name} VALUE or inspect --help.`,
    });
  return value;
}

function currentHelpPath() {
  if (!group || group === "help") return [];
  if (command === "--help") return [group];
  if (group === "users" && command === "role" && args[2] === "set")
    return [group, command, "set"];
  return command ? [group, command] : [group];
}

async function contractCommand() {
  if (command !== "show")
    throw new Error(`Unknown contract command: ${command ?? ""}`);
  return output(await loadContract(hub, option("--kind", "catalog")!));
}

async function catalogCommand() {
  if (command === "inventory")
    return output(
      await loadCatalogInventory(hub, {
        all: flag("--all"),
        ...(option("--cursor") ? { cursor: option("--cursor")! } : {}),
        limit: Number(option("--limit", "100")),
      }),
    );
  if (command === "worklist") return output(await loadCatalogWorklist(hub));
  if (command === "verify") {
    const result = await verifyEvidenceManifest(await readJsonInput());
    await output(result);
    if (!result.qualified) process.exitCode = 2;
    return;
  }
  if (command === "check") {
    const contract = await loadContract(hub, "catalog");
    const result = validateCatalogPage(
      await readJsonInput(),
      contract.policy.categories ?? [],
    );
    return output({
      valid: result.valid,
      schemaVersion: result.schemaVersion,
      items: result.items.length,
      identities: result.items.map((item) => item.verification.identityKey),
    });
  }
  throw new Error(`Unknown catalog command: ${command ?? ""}`);
}

async function syncCommand() {
  if (command === "start") {
    const idempotencyKey = requireOption("--idempotency-key");
    const expectedItems = Number(requireOption("--expected"));
    if (
      !Number.isInteger(expectedItems) ||
      expectedItems < 1 ||
      expectedItems > 500
    )
      throw new Error("--expected must be an integer from 1 to 500");
    return output(
      await api(hub, "/api/ops/catalog/runs", {
        method: "POST",
        body: JSON.stringify({
          schemaVersion: 2,
          mode: option("--mode", "incremental"),
          idempotencyKey,
          expectedItems,
          cliVersion: await cliVersion(),
          checkerVersion: "3",
        }),
      }),
    );
  }
  if (command === "put") {
    const runId = requireOption("--run");
    const contract = await loadContract(hub, "catalog");
    const parsed = validateCatalogPage(
      await readJsonInput(),
      contract.policy.categories ?? [],
    );
    return output(
      await api(hub, `/api/ops/catalog/runs/${runId}/items`, {
        method: "PUT",
        body: JSON.stringify({ items: parsed.items }),
      }),
    );
  }
  if (command === "preview") {
    const runId = option("--run");
    if (runId) return output(await api(hub, `/api/ops/catalog/runs/${runId}`));
    const contract = await loadContract(hub, "catalog");
    const parsed = validateCatalogPage(
      await readJsonInput(),
      contract.policy.categories ?? [],
    );
    return output({
      valid: true,
      items: parsed.items.length,
      identities: parsed.items.map((item) => item.verification.identityKey),
      locales: parsed.items.map((item) =>
        item.localizations.map((entry) => entry.locale),
      ),
    });
  }
  if (["commit", "abort"].includes(command ?? "")) {
    const runId = requireOption("--run");
    return output(
      await api(hub, `/api/ops/catalog/runs/${runId}/${command}`, {
        method: "POST",
      }),
    );
  }
  if (command === "resume") {
    const runId = option("--run");
    if (runId) return output(await api(hub, `/api/ops/catalog/runs/${runId}`));
    const result = await api<{ items: unknown[] }>(
      hub,
      "/api/ops/catalog/runs?status=open",
    );
    return output({
      run: result.items[0] ?? null,
      openRuns: result.items.length,
    });
  }
  throw new Error(`Unknown sync command: ${command ?? ""}`);
}

async function moderationCommand() {
  if (command === "queue")
    return output(await api(hub, "/api/ops/moderation/queue"));
  if (
    [
      "hide",
      "restore",
      "dismiss",
      "restrict",
      "unrestrict",
      "ban",
      "unban",
    ].includes(command ?? "")
  ) {
    const targetId = requireOption("--target");
    const targetType = option(
      "--type",
      ["restrict", "unrestrict", "ban", "unban"].includes(command ?? "")
        ? "user"
        : "review",
    );
    const reportIds = (option("--reports", "") ?? "")
      .split(",")
      .filter(Boolean);
    const result = await api<Record<string, unknown>>(
      hub,
      "/api/ops/moderation/actions",
      {
        method: "POST",
        headers: {
          "idempotency-key": option(
            "--idempotency-key",
            `moderation-${command}-${targetId}`,
          )!,
        },
        body: JSON.stringify({
          action: command,
          targetType,
          targetId,
          reason: option("--reason", "operator action"),
          expiresAt: option("--expires") ?? null,
          reportIds,
          decisionCode: option("--decision-code") ?? null,
          confidence: option("--confidence")
            ? Number(option("--confidence"))
            : null,
          policyVersion: option("--policy-version") ?? null,
        }),
      },
    );
    return output(
      result["requiresApproval"] === true
        ? withApprovalResume(hub, result)
        : result,
    );
  }
  throw new Error(`Unknown moderation command: ${command ?? ""}`);
}

async function approvalsCommand() {
  const id = option("--id");
  if (command === "create")
    return output(await createApproval(hub, await readJsonInput()));
  if (!id) throw new Error("--id is required");
  if (command === "show") return output(await showApproval(hub, id));
  if (command === "wait")
    return output(
      await waitForApproval(hub, id, Number(option("--timeout", "300"))),
    );
  if (command === "revise")
    return output(await reviseApproval(hub, id, await readJsonInput()));
  if (command === "claim-effect")
    return output(await claimApprovalEffect(hub, id, option("--run")));
  if (command === "effect-result") {
    const leaseToken = requireOption("--lease");
    const effectStatus = requireOption("--status");
    if (!["succeeded", "failed"].includes(effectStatus))
      throw new Error("--status must be succeeded or failed");
    const inputPath = option("--input");
    const payload = inputPath
      ? ((await readJsonInput(inputPath)) as Record<string, unknown>)
      : {};
    return output(
      await submitApprovalEffectResult(hub, id, {
        ...payload,
        leaseToken,
        status: effectStatus,
        error: option("--error") ?? payload["error"] ?? null,
      }),
    );
  }
  throw new Error(`Unknown approvals command: ${command ?? ""}`);
}

async function main() {
  if (flag("--version")) {
    process.stdout.write(`${await cliVersion()}\n`);
    return;
  }
  if (!group || group === "help" || flag("--help")) {
    process.stdout.write(helpText(currentHelpPath()));
    return;
  }
  if (group === "auth") {
    if (command === "login")
      return output(
        await login(
          hub,
          option(
            "--scopes",
            "catalog:write,moderation:write,approvals:write",
          )!.split(","),
        ),
      );
    if (command === "status") return output(await status(hub));
    if (command === "logout") {
      await logout(hub);
      return output({ loggedOut: true });
    }
  }
  if (group === "contract") return contractCommand();
  if (group === "catalog") return catalogCommand();
  if (group === "sync") return syncCommand();
  if (group === "metrics") {
    if (command === "submit")
      return output(await submitMetrics(hub, await readJsonInput()));
  }
  if (group === "targets") {
    if (command === "submit")
      return output(
        await submitTargetVerification(
          hub,
          await readJsonInput(),
          requireOption("--idempotency-key"),
        ),
      );
  }
  if (group === "media") {
    if (command === "check")
      return output(await checkMedia(await readJsonInput()));
    if (command === "upload")
      return output(await uploadMedia(hub, await readJsonInput()));
  }
  if (group === "maintenance" && command === "audit") {
    const scope = option("--scope", "daily");
    if (scope !== "daily" && scope !== "full")
      throw new Error("--scope must be daily or full");
    return output(await runMaintenanceAudit(hub, scope));
  }
  if (group === "moderation") return moderationCommand();
  if (group === "approvals") return approvalsCommand();
  if (group === "users" && command === "role" && args[2] === "set") {
    const id = requireOption("--user");
    const role = requireOption("--role");
    return output(
      withApprovalResume(
        hub,
        await api<Record<string, unknown>>(hub, `/api/ops/users/${id}/role`, {
          method: "PUT",
          body: JSON.stringify({
            role,
            reason: option("--reason", "Requested through Hub CLI"),
            idempotencyKey: option("--idempotency-key", `role-${id}-${role}`),
          }),
        }),
      ),
    );
  }
  throw new Error(`Unknown command: ${group} ${command ?? ""}`);
}

main().catch((error: unknown) => {
  json({ ok: false, errors: issuesFrom(error) }, process.stderr);
  process.exitCode = 1;
});

export { helpText, validateCatalogPage, verifyEvidenceManifest };
