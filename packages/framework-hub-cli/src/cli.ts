import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { login, logout, status as authStatus } from "./auth.js";
import { CliError, normalizedError } from "./errors.js";
import { helpText } from "./help.js";
import { uploadMedia } from "./media.js";
import {
  auditHub,
  curatePlugin,
  exitCodeForSuccess,
  getPlugin,
  getSubmission,
  hubStatus,
  latestReport,
  listPlugins,
  listSubmissions,
  publishReport,
  resolveSubmission,
  setPluginVisibility,
  upsertPlugins,
} from "./operations.js";
import {
  failureEnvelope,
  successEnvelope,
  type SuccessEnvelope,
} from "./protocol.js";
import { discoverSources, inspectSource } from "./source.js";

const options = {
  hub: { type: "string" },
  input: { type: "string" },
  output: { type: "string" },
  all: { type: "boolean" },
  "dry-run": { type: "boolean" },
  state: { type: "string", multiple: true },
  needs: { type: "string", multiple: true },
  source: { type: "string", multiple: true },
  risk: { type: "string", multiple: true },
  status: { type: "string", multiple: true },
  "observed-before": { type: "string" },
  "updated-before": { type: "string" },
  limit: { type: "string" },
  cursor: { type: "string" },
  "if-revision": { type: "string" },
  reason: { type: "string" },
  result: { type: "string" },
  plugin: { type: "string" },
  scope: { type: "string" },
  scopes: { type: "string" },
  provider: { type: "string" },
  query: { type: "string" },
  since: { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "V" },
} as const;

export type CliStreams = {
  stdin: AsyncIterable<Uint8Array | string>;
  stdout: { write(value: string): unknown };
  stderr: { write(value: string): unknown };
};

const processStreams: CliStreams = {
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr,
};

async function stdin(stream: CliStreams["stdin"]): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonInput(
  path: string,
  stream: CliStreams["stdin"],
): Promise<unknown> {
  const source =
    path === "-" ? await stdin(stream) : await readFile(resolve(path), "utf8");
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    throw new CliError({
      code: "invalid_json",
      message:
        error instanceof Error ? error.message : "Input is not valid JSON.",
      retryable: false,
      repairHint: "Correct the JSON document and retry.",
      path,
    });
  }
}

async function writeJson(
  value: unknown,
  outputPath: string | undefined,
  stream: CliStreams["stdout"],
) {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (outputPath) await writeFile(resolve(outputPath), json);
  else stream.write(json);
}

async function cliVersion() {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version?: string };
  return packageJson.version ?? "unknown";
}

function parse(argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      options,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    throw new CliError({
      code: "invalid_arguments",
      message:
        error instanceof Error
          ? error.message
          : "Command arguments are invalid.",
      retryable: false,
      repairHint: "Inspect --help and correct the command arguments.",
    });
  }
}

function textOption(
  values: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = values[name];
  return typeof value === "string" && value ? value : undefined;
}

function manyOption(
  values: Record<string, unknown>,
  name: string,
): string[] | undefined {
  const raw = values[name];
  const entries = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? [raw]
      : [];
  const normalized = entries
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  return normalized.length ? normalized : undefined;
}

function integerOption(
  values: Record<string, unknown>,
  name: string,
): number | undefined {
  const value = textOption(values, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed))
    throw new CliError({
      code: "invalid_option",
      message: `--${name} must be an integer.`,
      retryable: false,
      repairHint: `Provide an integer value for --${name}.`,
      path: `--${name}`,
    });
  return parsed;
}

function requireTextOption(
  values: Record<string, unknown>,
  name: string,
): string {
  const value = textOption(values, name);
  if (!value)
    throw new CliError({
      code: "missing_option",
      message: `--${name} is required.`,
      retryable: false,
      repairHint: `Provide --${name} VALUE or inspect --help.`,
      path: `--${name}`,
    });
  return value;
}

function requirePositional(
  positionals: string[],
  index: number,
  label: string,
): string {
  const value = positionals[index];
  if (!value)
    throw new CliError({
      code: "missing_argument",
      message: `${label} is required.`,
      retryable: false,
      repairHint: "Inspect --help and provide the missing positional argument.",
      path: label,
    });
  return value;
}

function normalizedHub(values: Record<string, unknown>): string {
  const raw =
    textOption(values, "hub") ??
    process.env["DSHX_HUB_URL"] ??
    "https://dshx.io";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CliError({
      code: "invalid_hub_url",
      message: "Hub URL is invalid.",
      retryable: false,
      repairHint: "Use an absolute HTTP or HTTPS Hub URL.",
      path: "--hub",
    });
  }
  if (!/^https?:$/.test(url.protocol))
    throw new CliError({
      code: "invalid_hub_url",
      message: "Hub URL must use HTTP or HTTPS.",
      retryable: false,
      repairHint:
        "Use HTTPS in production or HTTP for a trusted local preview.",
      path: "--hub",
    });
  return url.toString().replace(/\/$/, "");
}

function deprecatedCommand(group: string): never {
  const replacements: Record<string, string> = {
    sync: "Use source inspect, plugin upsert, and plugin list as independent operations.",
    catalog: "Use source inspect, plugin list, plugin get, or plugin upsert.",
    targets:
      "Submit install-target facts through PluginObservationV1 with plugin upsert.",
    metrics:
      "Submit sourced metrics through PluginObservationV1 with plugin upsert.",
    maintenance: "Use dshx-hub audit.",
    approvals:
      "Approval workflows are no longer part of default catalog operations.",
    moderation:
      "Use plugin hide/restore for catalog visibility; community administration is separate.",
    users: "User-role administration is separate from catalog operations.",
    contract:
      "The CLI embeds its input schema; no contract preflight is required.",
  };
  throw new CliError({
    code: "deprecated_command",
    message: `The ${group} command group has been removed from the default CLI.`,
    retryable: false,
    repairHint:
      replacements[group] ??
      "Inspect the new root help for an atomic replacement.",
  });
}

const commandShapes: Record<string, { arity: number; options: string[] }> = {
  "auth login": { arity: 2, options: ["hub", "output", "scopes"] },
  "auth status": { arity: 2, options: ["hub", "output"] },
  "auth logout": { arity: 2, options: ["hub", "output"] },
  status: { arity: 1, options: ["hub", "output"] },
  "source inspect": { arity: 3, options: ["output"] },
  "source discover": {
    arity: 2,
    options: ["provider", "query", "since", "cursor", "limit", "output"],
  },
  "report latest": { arity: 2, options: ["hub", "output"] },
  "report publish": { arity: 2, options: ["hub", "input", "output"] },
  "plugin list": {
    arity: 2,
    options: [
      "hub",
      "output",
      "state",
      "needs",
      "source",
      "risk",
      "observed-before",
      "updated-before",
      "limit",
      "cursor",
      "all",
    ],
  },
  "plugin get": { arity: 3, options: ["hub", "output"] },
  "plugin upsert": {
    arity: 2,
    options: ["hub", "input", "output", "dry-run"],
  },
  "plugin curate": {
    arity: 3,
    options: ["hub", "input", "output", "if-revision"],
  },
  "plugin hide": { arity: 3, options: ["hub", "output", "reason"] },
  "plugin restore": { arity: 3, options: ["hub", "output", "reason"] },
  "submission list": {
    arity: 2,
    options: ["hub", "output", "status", "limit", "cursor", "all"],
  },
  "submission get": { arity: 3, options: ["hub", "output"] },
  "submission resolve": {
    arity: 3,
    options: ["hub", "output", "result", "plugin", "reason"],
  },
  "media upload": { arity: 3, options: ["hub", "input", "output"] },
  audit: { arity: 1, options: ["hub", "output", "scope"] },
};

function validateCommandShape(
  positionals: string[],
  values: Record<string, unknown>,
) {
  const group = positionals[0];
  if (!group) return;
  const key =
    group === "status" || group === "audit"
      ? group
      : `${group} ${positionals[1] ?? ""}`;
  const shape = commandShapes[key];
  if (!shape) return;
  if (positionals.length !== shape.arity)
    throw new CliError({
      code: "invalid_arguments",
      message: `The ${key} command received an unexpected positional argument.`,
      retryable: false,
      repairHint: `Inspect dshx-hub ${key} --help and remove extra arguments.`,
      path: `arguments.${shape.arity}`,
      details: { expected: shape.arity, received: positionals.length },
    });
  const allowed = new Set([...shape.options, "help", "version"]);
  const unexpected = Object.keys(values).find((name) => !allowed.has(name));
  if (unexpected)
    throw new CliError({
      code: "invalid_arguments",
      message: `--${unexpected} is not valid for ${key}.`,
      retryable: false,
      repairHint: `Remove --${unexpected} or inspect dshx-hub ${key} --help.`,
      path: `--${unexpected}`,
    });
}

async function execute(
  positionals: string[],
  values: Record<string, unknown>,
  streams: CliStreams,
): Promise<{ envelope: SuccessEnvelope<unknown>; exitCode: 0 | 1 | 2 }> {
  const group = positionals[0];
  const command = positionals[1];
  let cachedHub: string | undefined;
  const hub = () => (cachedHub ??= normalizedHub(values));
  let envelope: SuccessEnvelope<unknown>;

  if (group === "auth") {
    if (command === "login")
      envelope = successEnvelope(
        await login(
          hub(),
          (textOption(values, "scopes") ?? "catalog:write")
            .split(",")
            .map((scope) => scope.trim())
            .filter(Boolean),
        ),
      );
    else if (command === "status")
      envelope = successEnvelope(await authStatus(hub()));
    else if (command === "logout") {
      await logout(hub());
      envelope = successEnvelope({ loggedOut: true });
    } else
      throw new CliError({
        code: "unknown_command",
        message: `Unknown auth command: ${command ?? ""}.`,
        retryable: false,
        repairHint: "Use auth login, auth status, or auth logout.",
      });
  } else if (group === "status") envelope = await hubStatus(hub());
  else if (group === "report") {
    if (command === "latest") envelope = await latestReport(hub());
    else if (command === "publish")
      envelope = await publishReport(
        hub(),
        await readJsonInput(requireTextOption(values, "input"), streams.stdin),
      );
    else
      throw new CliError({
        code: "unknown_command",
        message: `Unknown report command: ${command ?? ""}.`,
        retryable: false,
        repairHint: "Use report latest or report publish.",
      });
  } else if (group === "source" && command === "inspect") {
    const inspected = await inspectSource(
      requirePositional(positionals, 2, "SOURCE"),
    );
    envelope = successEnvelope(inspected.data, inspected.warnings);
  } else if (group === "source" && command === "discover") {
    const provider = requireTextOption(values, "provider");
    if (provider !== "github" && provider !== "npm")
      throw new CliError({
        code: "invalid_provider",
        message: "--provider must be github or npm.",
        retryable: false,
        repairHint: "Choose one supported public discovery provider.",
        path: "--provider",
      });
    const discovered = await discoverSources({
      provider,
      query: requireTextOption(values, "query"),
      since: requireTextOption(values, "since"),
      ...(textOption(values, "cursor")
        ? { cursor: textOption(values, "cursor")! }
        : {}),
      ...(integerOption(values, "limit") === undefined
        ? {}
        : { limit: integerOption(values, "limit")! }),
    });
    envelope = successEnvelope(discovered.data, discovered.warnings);
  } else if (group === "plugin") {
    if (command === "list")
      envelope = await listPlugins(hub(), {
        ...(manyOption(values, "state")
          ? { state: manyOption(values, "state")! }
          : {}),
        ...(manyOption(values, "needs")
          ? { needs: manyOption(values, "needs")! }
          : {}),
        ...(manyOption(values, "source")
          ? { source: manyOption(values, "source")! }
          : {}),
        ...(manyOption(values, "risk")
          ? { risk: manyOption(values, "risk")! }
          : {}),
        ...(textOption(values, "observed-before")
          ? { observedBefore: textOption(values, "observed-before")! }
          : {}),
        ...(textOption(values, "updated-before")
          ? { updatedBefore: textOption(values, "updated-before")! }
          : {}),
        ...(integerOption(values, "limit") === undefined
          ? {}
          : { limit: integerOption(values, "limit")! }),
        ...(textOption(values, "cursor")
          ? { cursor: textOption(values, "cursor")! }
          : {}),
        all: values["all"] === true,
      });
    else if (command === "get")
      envelope = await getPlugin(
        hub(),
        requirePositional(positionals, 2, "ID_OR_SLUG"),
      );
    else if (command === "upsert") {
      envelope = await upsertPlugins(
        hub(),
        await readJsonInput(requireTextOption(values, "input"), streams.stdin),
        values["dry-run"] === true,
      );
    } else if (command === "curate")
      envelope = await curatePlugin(
        hub(),
        requirePositional(positionals, 2, "PLUGIN_ID"),
        await readJsonInput(requireTextOption(values, "input"), streams.stdin),
        integerOption(values, "if-revision"),
      );
    else if (command === "hide" || command === "restore")
      envelope = await setPluginVisibility(
        hub(),
        requirePositional(positionals, 2, "PLUGIN_ID"),
        command === "hide" ? "hidden" : "visible",
        requireTextOption(values, "reason"),
      );
    else
      throw new CliError({
        code: "unknown_command",
        message: `Unknown plugin command: ${command ?? ""}.`,
        retryable: false,
        repairHint: "Inspect dshx-hub plugin --help.",
      });
  } else if (group === "submission") {
    if (command === "list")
      envelope = await listSubmissions(hub(), {
        ...(manyOption(values, "status")
          ? { status: manyOption(values, "status")! }
          : {}),
        ...(integerOption(values, "limit") === undefined
          ? {}
          : { limit: integerOption(values, "limit")! }),
        ...(textOption(values, "cursor")
          ? { cursor: textOption(values, "cursor")! }
          : {}),
        all: values["all"] === true,
      });
    else if (command === "get")
      envelope = await getSubmission(
        hub(),
        requirePositional(positionals, 2, "SUBMISSION_ID"),
      );
    else if (command === "resolve") {
      const result = requireTextOption(values, "result");
      if (!(["accepted", "duplicate", "ignored"] as string[]).includes(result))
        throw new CliError({
          code: "invalid_result",
          message: "--result must be accepted, duplicate, or ignored.",
          retryable: false,
          repairHint: "Choose one supported submission resolution.",
          path: "--result",
        });
      envelope = await resolveSubmission(
        hub(),
        requirePositional(positionals, 2, "SUBMISSION_ID"),
        {
          result: result as "accepted" | "duplicate" | "ignored",
          ...(textOption(values, "plugin")
            ? { pluginId: textOption(values, "plugin")! }
            : {}),
          ...(textOption(values, "reason")
            ? { reason: textOption(values, "reason")! }
            : {}),
        },
      );
    } else
      throw new CliError({
        code: "unknown_command",
        message: `Unknown submission command: ${command ?? ""}.`,
        retryable: false,
        repairHint: "Inspect dshx-hub submission --help.",
      });
  } else if (group === "media" && command === "upload")
    envelope = await uploadMedia(
      hub(),
      requirePositional(positionals, 2, "PLUGIN_ID"),
      await readJsonInput(requireTextOption(values, "input"), streams.stdin),
    );
  else if (group === "audit") {
    const scope = textOption(values, "scope");
    if (
      scope &&
      !(["catalog", "storage", "community"] as string[]).includes(scope)
    )
      throw new CliError({
        code: "invalid_scope",
        message: "--scope must be catalog, storage, or community.",
        retryable: false,
        repairHint: "Choose one supported audit scope or omit --scope.",
        path: "--scope",
      });
    envelope = await auditHub(
      hub(),
      scope as "catalog" | "storage" | "community" | undefined,
    );
  } else if (
    group &&
    [
      "sync",
      "catalog",
      "targets",
      "metrics",
      "maintenance",
      "approvals",
      "moderation",
      "users",
      "contract",
    ].includes(group)
  )
    deprecatedCommand(group);
  else
    throw new CliError({
      code: "unknown_command",
      message: `Unknown command: ${positionals.join(" ")}.`,
      retryable: false,
      repairHint:
        "Inspect dshx-hub --help for the default atomic command tree.",
    });

  return { envelope, exitCode: exitCodeForSuccess(envelope) };
}

export async function runCli(
  argv: string[],
  streams: CliStreams = processStreams,
): Promise<number> {
  try {
    const parsed = parse(argv);
    const positionals = parsed.positionals;
    const values = parsed.values as Record<string, unknown>;
    if (values["version"] === true) {
      streams.stdout.write(`${await cliVersion()}\n`);
      return 0;
    }
    if (
      !positionals.length ||
      positionals[0] === "help" ||
      values["help"] === true
    ) {
      const path =
        positionals[0] === "help"
          ? positionals.slice(1, 3)
          : positionals.slice(0, 2);
      streams.stdout.write(helpText(path));
      return 0;
    }
    validateCommandShape(positionals, values);
    const result = await execute(positionals, values, streams);
    await writeJson(
      result.envelope,
      textOption(values, "output"),
      streams.stdout,
    );
    return result.exitCode;
  } catch (error) {
    const normalized = normalizedError(error);
    streams.stderr.write(
      `${JSON.stringify(failureEnvelope(normalized.error, normalized.requestId), null, 2)}\n`,
    );
    return 1;
  }
}
