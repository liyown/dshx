import { api, ApiError } from "./api.js";
import {
  curationContentSchema,
  operationReportInputSchema,
  parsePluginObservation,
  pluginListOptionsSchema,
  submissionListOptionsSchema,
  submissionResolutionInputSchema,
  type PluginObservationV1,
  visibilityInputSchema,
} from "./contracts.js";
import { CliError, normalizedError } from "./errors.js";
import {
  isSuccessEnvelope,
  successEnvelope,
  type OperationWarning,
  type SuccessEnvelope,
} from "./protocol.js";

export type PluginListOptions = {
  state?: string[];
  needs?: string[];
  source?: string[];
  risk?: string[];
  observedBefore?: string;
  updatedBefore?: string;
  limit?: number;
  cursor?: string;
  all?: boolean;
};

export type SubmissionListOptions = {
  status?: string[];
  limit?: number;
  cursor?: string;
  all?: boolean;
};

type Page = { items: unknown[]; nextCursor: string | null };
const maximumObservationBatch = 100;

function positiveLimit(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 100)
    throw new CliError({
      code: "invalid_limit",
      message: "--limit must be an integer from 1 to 100.",
      retryable: false,
      repairHint: "Choose a limit between 1 and 100.",
      path: "--limit",
    });
  return value;
}

function appendMany(query: URLSearchParams, name: string, values?: string[]) {
  for (const value of values ?? []) query.append(name, value);
}

async function allPages(
  hub: string,
  path: string,
  initialQuery: URLSearchParams,
): Promise<SuccessEnvelope<Page>> {
  const items: unknown[] = [];
  const warnings: OperationWarning[] = [];
  const seen = new Set<string>();
  let cursor = initialQuery.get("cursor") ?? undefined;
  let requestId: string | undefined;
  for (let pageNumber = 0; pageNumber < 1_000; pageNumber += 1) {
    const query = new URLSearchParams(initialQuery);
    if (cursor) query.set("cursor", cursor);
    else query.delete("cursor");
    const envelope = await api<Page>(hub, `${path}?${query}`);
    requestId ??= envelope.meta.requestId;
    items.push(...envelope.data.items);
    warnings.push(...envelope.warnings);
    const next = envelope.data.nextCursor ?? undefined;
    if (!next)
      return successEnvelope({ items, nextCursor: null }, warnings, requestId);
    if (seen.has(next))
      throw new CliError({
        code: "cursor_cycle",
        message: "The Hub repeated a pagination cursor.",
        retryable: true,
        repairHint:
          "Retry later or continue with an explicit cursor after inspecting Hub state.",
        details: { cursor: next },
      });
    seen.add(next);
    cursor = next;
  }
  throw new CliError({
    code: "pagination_limit_exceeded",
    message: "Pagination exceeded the in-process safety limit.",
    retryable: false,
    repairHint: "Use narrower filters or continue from an explicit cursor.",
  });
}

export function hubStatus(hub: string) {
  return api(hub, "/api/ops/v1/status", {}, "optional");
}

export function latestReport(hub: string) {
  return api(hub, "/api/ops/v1/reports");
}

export function publishReport(hub: string, input: unknown) {
  const report = operationReportInputSchema.parse(input);
  return api(hub, "/api/ops/v1/reports", {
    method: "POST",
    body: JSON.stringify(report),
  });
}

export function listPlugins(hub: string, options: PluginListOptions) {
  const limit = positiveLimit(options.limit);
  const parsed = pluginListOptionsSchema.parse(options);
  const query = new URLSearchParams();
  appendMany(query, "state", parsed.state);
  appendMany(query, "needs", parsed.needs);
  appendMany(query, "source", parsed.source);
  appendMany(query, "risk", parsed.risk);
  if (parsed.observedBefore) query.set("observedBefore", parsed.observedBefore);
  if (parsed.updatedBefore) query.set("updatedBefore", parsed.updatedBefore);
  if (parsed.cursor) query.set("cursor", parsed.cursor);
  if (limit) query.set("limit", String(limit));
  return parsed.all
    ? allPages(hub, "/api/ops/v1/plugins", query)
    : api<Page>(hub, `/api/ops/v1/plugins?${query}`);
}

export function getPlugin(hub: string, idOrSlug: string) {
  return api(hub, `/api/ops/v1/plugins/${encodeURIComponent(idOrSlug)}`);
}

function observationInput(raw: unknown): {
  values: unknown[];
  batch: boolean;
  warnings: OperationWarning[];
  dryRun: boolean;
} {
  let value = raw;
  let warnings: OperationWarning[] = [];
  if (isSuccessEnvelope(value)) {
    warnings = Array.isArray(value.warnings) ? value.warnings : [];
    value = value.data;
  }
  if (Array.isArray(value))
    return { values: value, batch: true, warnings, dryRun: false };
  if (value && typeof value === "object" && "observations" in value) {
    const document = value as { observations?: unknown; dryRun?: unknown };
    const observations = document.observations;
    if (!Array.isArray(observations))
      throw new CliError({
        code: "invalid_input",
        message: "observations must be an array.",
        retryable: false,
        repairHint:
          "Provide one observation, an array, or an object with an observations array.",
        path: "observations",
      });
    if (document.dryRun !== undefined && typeof document.dryRun !== "boolean")
      throw new CliError({
        code: "invalid_input",
        message: "dryRun must be a boolean when provided in a batch document.",
        retryable: false,
        repairHint: "Set dryRun to true or false, or remove the field.",
        path: "dryRun",
      });
    return {
      values: observations,
      batch: true,
      warnings,
      dryRun: document.dryRun === true,
    };
  }
  return { values: [value], batch: false, warnings, dryRun: false };
}

function rawIdentity(value: unknown): string {
  if (!value || typeof value !== "object") return "unknown";
  const identity = (value as { identity?: unknown }).identity;
  if (!identity || typeof identity !== "object") return "unknown";
  const object = identity as Record<string, unknown>;
  if (object["kind"] === "npm" && typeof object["packageName"] === "string")
    return `npm:${object["packageName"]}`;
  if (object["kind"] === "github")
    return `github:${String(object["repositoryId"] ?? "")}:${String(object["subdirectory"] ?? "")}`;
  return "unknown";
}

function rejectedInput(value: unknown, error: unknown) {
  const normalized = normalizedError(error).error;
  return {
    identity: rawIdentity(value),
    status: "rejected",
    error: normalized,
  };
}

function mergeLocalRejections(
  remote: SuccessEnvelope<unknown>,
  ordered: Array<
    | { remote: true }
    | { remote: false; result: ReturnType<typeof rejectedInput> }
  >,
): SuccessEnvelope<unknown> {
  if (ordered.every((entry) => entry.remote)) return remote;
  const data =
    remote.data && typeof remote.data === "object"
      ? (remote.data as Record<string, unknown>)
      : {};
  const results = Array.isArray(data["results"]) ? [...data["results"]] : [];
  let remoteIndex = 0;
  const merged = ordered.map((entry) =>
    entry.remote ? results[remoteIndex++] : entry.result,
  );
  return {
    ...remote,
    data: { ...data, results: merged },
  };
}

async function submitObservationBatch(
  hub: string,
  observations: PluginObservationV1[],
  dryRun: boolean,
): Promise<SuccessEnvelope<unknown>> {
  const results: unknown[] = [];
  const warnings: OperationWarning[] = [];
  const requestIds: string[] = [];
  let firstData: Record<string, unknown> = {};
  for (
    let offset = 0;
    offset < observations.length;
    offset += maximumObservationBatch
  ) {
    const chunk = observations.slice(offset, offset + maximumObservationBatch);
    try {
      const envelope = await api<unknown>(
        hub,
        "/api/ops/v1/observations:batch",
        {
          method: "POST",
          body: JSON.stringify({ observations: chunk, dryRun }),
        },
      );
      if (!offset && envelope.data && typeof envelope.data === "object")
        firstData = envelope.data as Record<string, unknown>;
      const chunkResults =
        envelope.data &&
        typeof envelope.data === "object" &&
        Array.isArray((envelope.data as Record<string, unknown>)["results"])
          ? ((envelope.data as Record<string, unknown>)["results"] as unknown[])
          : [];
      if (chunkResults.length !== chunk.length)
        throw new CliError(
          {
            code: "invalid_hub_response",
            message:
              "The Hub batch result count did not match the submitted observations.",
            retryable: true,
            repairHint:
              "Inspect the submitted observation IDs and report the Hub response mismatch.",
            details: {
              offset,
              submitted: chunk.length,
              received: chunkResults.length,
              requestId: envelope.meta.requestId,
            },
          },
          envelope.meta.requestId,
        );
      results.push(...chunkResults);
      warnings.push(...envelope.warnings);
      requestIds.push(
        ...(envelope.meta.requestIds ?? [envelope.meta.requestId]),
      );
    } catch (caught) {
      const { error, requestId } = normalizedError(caught);
      const notSent =
        (caught instanceof ApiError &&
          caught.status === 401 &&
          caught.body === null &&
          error.code === "authentication_required") ||
        (caught instanceof CliError &&
          (error.code === "keyring_unavailable" ||
            error.code === "credential_store_unavailable" ||
            error.code === "ops_run_expired" ||
            error.code === "ops_run_not_owner" ||
            error.code.startsWith("ops_state_")));
      throw new CliError(
        {
          ...error,
          repairHint: [
            error.repairHint,
            "Use batchProgress to resume without repeating completed chunks.",
            ...(notSent
              ? []
              : [
                  "An uncertain observation may already have been applied; a missing result does not prove a write failed. Verify its state or reuse the same observation ID before resubmitting.",
                ]),
          ]
            .filter(Boolean)
            .join(" "),
          details: {
            ...(Array.isArray(error.details)
              ? { responseDetails: error.details }
              : error.details),
            batchProgress: {
              completedResults: results,
              completedRequestIds: [...new Set(requestIds)],
              uncertainObservationIds: notSent
                ? []
                : chunk.map(({ observationId }) => observationId),
              notAttemptedObservationIds: observations
                .slice(notSent ? offset : offset + chunk.length)
                .map(({ observationId }) => observationId),
            },
          },
        },
        requestId,
      );
    }
  }
  const uniqueRequestIds = [...new Set(requestIds)];
  return {
    ok: true,
    data: { ...firstData, results },
    warnings,
    meta: {
      requestId: uniqueRequestIds[0]!,
      ...(uniqueRequestIds.length > 1 ? { requestIds: uniqueRequestIds } : {}),
    },
  };
}

export async function upsertPlugins(
  hub: string,
  raw: unknown,
  dryRun: boolean,
): Promise<SuccessEnvelope<unknown>> {
  const input = observationInput(raw);
  const effectiveDryRun = dryRun || input.dryRun;
  if (!input.values.length)
    throw new CliError({
      code: "invalid_input",
      message: "At least one observation is required.",
      retryable: false,
      repairHint:
        "Provide one PluginObservationV1 or a non-empty observations array.",
    });
  const observations: PluginObservationV1[] = [];
  const localRejections: Array<ReturnType<typeof rejectedInput>> = [];
  const ordered: Array<
    | { remote: true }
    | { remote: false; result: ReturnType<typeof rejectedInput> }
  > = [];
  for (const value of input.values)
    try {
      observations.push(parsePluginObservation(value));
      ordered.push({ remote: true });
    } catch (error) {
      if (!input.batch && input.values.length === 1) throw error;
      const rejection = rejectedInput(value, error);
      localRejections.push(rejection);
      ordered.push({ remote: false, result: rejection });
    }

  if (!observations.length)
    return successEnvelope({ results: localRejections }, input.warnings);

  const remote = input.batch
    ? await submitObservationBatch(hub, observations, effectiveDryRun)
    : await api<unknown>(
        hub,
        `/api/ops/v1/observations/${observations[0]!.observationId}${effectiveDryRun ? "?dryRun=true" : ""}`,
        { method: "PUT", body: JSON.stringify(observations[0]) },
      );
  return mergeLocalRejections(
    { ...remote, warnings: [...input.warnings, ...remote.warnings] },
    ordered,
  );
}

export async function curatePlugin(
  hub: string,
  pluginId: string,
  raw: unknown,
  ifRevision?: number,
) {
  if (
    ifRevision !== undefined &&
    (!Number.isInteger(ifRevision) || ifRevision < 1)
  )
    throw new CliError({
      code: "invalid_revision",
      message: "--if-revision must be a positive integer.",
      retryable: false,
      repairHint: "Use the revision returned by plugin get.",
      path: "--if-revision",
    });
  const content = curationContentSchema.parse(raw);
  return api(
    hub,
    `/api/ops/v1/plugins/${encodeURIComponent(pluginId)}/curation`,
    {
      method: "PATCH",
      body: JSON.stringify({
        content,
        ...(ifRevision === undefined ? {} : { ifRevision }),
      }),
    },
  );
}

export function setPluginVisibility(
  hub: string,
  pluginId: string,
  visibility: "hidden" | "visible",
  reason: string,
) {
  const input = visibilityInputSchema.parse({ visibility, reason });
  return api(
    hub,
    `/api/ops/v1/plugins/${encodeURIComponent(pluginId)}/visibility`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export function listSubmissions(hub: string, options: SubmissionListOptions) {
  const limit = positiveLimit(options.limit);
  const parsed = submissionListOptionsSchema.parse(options);
  const query = new URLSearchParams();
  appendMany(query, "status", parsed.status);
  if (parsed.cursor) query.set("cursor", parsed.cursor);
  if (limit) query.set("limit", String(limit));
  return parsed.all
    ? allPages(hub, "/api/ops/v1/submissions", query)
    : api<Page>(hub, `/api/ops/v1/submissions?${query}`);
}

export function getSubmission(hub: string, id: string) {
  return api(hub, `/api/ops/v1/submissions/${encodeURIComponent(id)}`);
}

export function resolveSubmission(
  hub: string,
  id: string,
  input: {
    result: "accepted" | "duplicate" | "ignored";
    pluginId?: string;
    reason?: string;
  },
) {
  if (
    (input.result === "accepted" || input.result === "duplicate") &&
    !input.pluginId
  )
    throw new CliError({
      code: "missing_option",
      message: `--plugin is required when --result is ${input.result}.`,
      retryable: false,
      repairHint: "Provide the accepted or existing plugin ID.",
      path: "--plugin",
    });
  if (input.result === "ignored" && !input.reason)
    throw new CliError({
      code: "missing_option",
      message: "--reason is required when --result is ignored.",
      retryable: false,
      repairHint: "Provide a concise audit reason.",
      path: "--reason",
    });
  const parsed = submissionResolutionInputSchema.parse(input);
  return api(
    hub,
    `/api/ops/v1/submissions/${encodeURIComponent(id)}/resolution`,
    {
      method: "PUT",
      body: JSON.stringify(parsed),
    },
  );
}

export function auditHub(
  hub: string,
  scope?: "catalog" | "storage" | "community",
) {
  const query = new URLSearchParams();
  if (scope) query.set("scope", scope);
  return api(hub, `/api/ops/v1/audit${query.size ? `?${query}` : ""}`);
}

export function exitCodeForSuccess(
  envelope: SuccessEnvelope<unknown>,
): 0 | 1 | 2 {
  const data = envelope.data;
  const results =
    data &&
    typeof data === "object" &&
    Array.isArray((data as Record<string, unknown>)["results"])
      ? ((data as Record<string, unknown>)["results"] as unknown[])
      : [];
  if (!results.length) return 0;
  const rejected = results.filter(
    (result) =>
      result &&
      typeof result === "object" &&
      (result as { status?: unknown }).status === "rejected",
  ).length;
  if (rejected === 0) return 0;
  return rejected === results.length ? 1 : 2;
}
