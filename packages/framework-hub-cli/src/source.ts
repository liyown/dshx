import { parse as parseYaml } from "yaml";

import {
  canonicalJson,
  observationIdFor,
  parsePluginObservation,
  sha256,
  type ObservationSource,
  type PluginObservationV1,
} from "./contracts.js";
import { CliError } from "./errors.js";
import type { OperationWarning } from "./protocol.js";

const maximumPackages = 100;
const maximumManifestBytes = 1_000_000;
const maximumReadmeCharacters = 200_000;

type SourceTarget =
  | { kind: "github"; owner: string; repository: string }
  | { kind: "npm"; packageName: string };

type RemoteResult<T> = { data: T; etag?: string };

type GitHubRepository = {
  id?: unknown;
  full_name?: unknown;
  private?: unknown;
  default_branch?: unknown;
  description?: unknown;
  homepage?: unknown;
  topics?: unknown;
  language?: unknown;
  license?: unknown;
  archived?: unknown;
  disabled?: unknown;
  stargazers_count?: unknown;
  forks_count?: unknown;
  open_issues_count?: unknown;
  pushed_at?: unknown;
  owner?: unknown;
};

type GitTreeEntry = {
  path?: unknown;
  type?: unknown;
  sha?: unknown;
  size?: unknown;
};

type GitTree = { sha?: unknown; truncated?: unknown; tree?: unknown };

type DetectionSignal = {
  kind: "dsh.bundle.patch" | "patch-file" | "readme" | "topic" | "package-name";
  value?: string;
};

export type SourceInspection = {
  source: { kind: "github" | "npm"; canonical: string };
  observations: PluginObservationV1[];
  truncated: boolean;
};

export type InspectSourceOptions = {
  fetch?: typeof fetch;
  githubToken?: string;
  now?: () => Date;
};

export type DiscoverSourceOptions = {
  provider: "github" | "npm";
  query: string;
  since: string;
  cursor?: string;
  limit?: number;
  fetch?: typeof fetch;
  githubToken?: string;
};

export type DiscoveredSource = {
  provider: "github" | "npm";
  canonical: string;
  url: string;
  updatedAt: string;
  matchedQuery: string;
  repositoryId?: string;
};

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function encodeDiscoveryCursor(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeDiscoveryCursor(
  cursor: string | undefined,
  provider: "github" | "npm",
  query: string,
) {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    if (
      value["provider"] === provider &&
      value["query"] === query &&
      typeof value["offset"] === "number" &&
      Number.isInteger(value["offset"]) &&
      value["offset"] >= 0
    )
      return value["offset"];
  } catch {
    // Normalized below.
  }
  throw sourceError(
    "invalid_cursor",
    "The discovery cursor does not match this provider and query.",
    false,
    "Restart source discover without --cursor.",
  );
}

export async function discoverSources(options: DiscoverSourceOptions): Promise<{
  data: {
    provider: "github" | "npm";
    query: string;
    since: string;
    candidates: DiscoveredSource[];
    nextCursor: string | null;
  };
  warnings: OperationWarning[];
}> {
  const query = options.query.trim();
  if (!query || query.length > 256)
    throw sourceError(
      "invalid_query",
      "--query must contain 1 to 256 characters.",
      false,
      "Provide one focused public-source search query.",
    );
  const sinceDate = new Date(options.since);
  if (!Number.isFinite(sinceDate.getTime()))
    throw sourceError(
      "invalid_since",
      "--since must be an ISO date or timestamp.",
      false,
      "Use YYYY-MM-DD or an ISO 8601 timestamp.",
    );
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw sourceError(
      "invalid_limit",
      "--limit must be an integer from 1 to 100.",
      false,
      "Choose a discovery page size between 1 and 100.",
    );
  const offset = decodeDiscoveryCursor(options.cursor, options.provider, query);
  const fetcher = options.fetch ?? globalThis.fetch;
  const warnings: OperationWarning[] = [];
  let candidates: DiscoveredSource[] = [];
  let total = 0;
  if (options.provider === "github") {
    const search = `${query} pushed:>=${sinceDate.toISOString().slice(0, 10)}`;
    const url = new URL("https://api.github.com/search/repositories");
    url.searchParams.set("q", search);
    url.searchParams.set("sort", "updated");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", String(limit));
    url.searchParams.set("page", String(Math.floor(offset / limit) + 1));
    const token =
      options.githubToken ??
      process.env["GITHUB_TOKEN"] ??
      process.env["GH_TOKEN"];
    const response = await remoteJson<Record<string, unknown>>(url.toString(), {
      fetch: fetcher,
      service: "github",
      headers: githubHeaders(token),
    });
    total = Math.min(1_000, numberValue(response?.data["total_count"]) ?? 0);
    const items = Array.isArray(response?.data["items"])
      ? response.data["items"]
      : [];
    candidates = items.flatMap((raw) => {
      const item = objectValue(raw);
      const fullName = stringValue(item?.["full_name"]);
      const rawRepositoryId = item?.["id"];
      const repositoryId =
        (typeof rawRepositoryId === "number" &&
          Number.isSafeInteger(rawRepositoryId)) ||
        (typeof rawRepositoryId === "string" && /^\d+$/.test(rawRepositoryId))
          ? String(rawRepositoryId)
          : undefined;
      const updatedAt = isoDate(item?.["updated_at"] ?? item?.["pushed_at"]);
      if (!fullName || !/^[^/\s]+\/[^/\s]+$/.test(fullName) || !updatedAt)
        return [];
      return [
        {
          provider: "github" as const,
          canonical: repositoryId
            ? `github:id:${repositoryId}`
            : `github:${fullName.toLowerCase()}`,
          url: `https://github.com/${fullName}`,
          updatedAt,
          matchedQuery: query,
          ...(repositoryId ? { repositoryId } : {}),
        },
      ];
    });
  } else {
    const url = new URL("https://registry.npmjs.org/-/v1/search");
    url.searchParams.set("text", query);
    url.searchParams.set("from", String(offset));
    url.searchParams.set("size", String(limit));
    const response = await remoteJson<Record<string, unknown>>(url.toString(), {
      fetch: fetcher,
      service: "npm",
    });
    total = numberValue(response?.data["total"]) ?? 0;
    const objects = Array.isArray(response?.data["objects"])
      ? response.data["objects"]
      : [];
    candidates = objects.flatMap((raw) => {
      const item = objectValue(raw);
      const packageData = objectValue(item?.["package"]);
      const name = stringValue(packageData?.["name"]);
      const updatedAt = isoDate(packageData?.["date"]);
      if (!name || !validPackageName(name) || !updatedAt) return [];
      if (Date.parse(updatedAt) < sinceDate.getTime()) return [];
      return [
        {
          provider: "npm" as const,
          canonical: `npm:${name.toLowerCase()}`,
          url: `https://www.npmjs.com/package/${name}`,
          updatedAt,
          matchedQuery: query,
        },
      ];
    });
  }
  const byCanonical = new Map<string, DiscoveredSource>();
  for (const candidate of candidates) {
    const current = byCanonical.get(candidate.canonical);
    if (
      !current ||
      Date.parse(candidate.updatedAt) > Date.parse(current.updatedAt)
    )
      byCanonical.set(candidate.canonical, candidate);
  }
  const unique = [...byCanonical.values()];
  const nextOffset = offset + limit;
  return {
    data: {
      provider: options.provider,
      query,
      since: sinceDate.toISOString(),
      candidates: unique,
      nextCursor:
        nextOffset < total
          ? encodeDiscoveryCursor({
              provider: options.provider,
              query,
              offset: nextOffset,
            })
          : null,
    },
    warnings,
  };
}

function sourceError(
  code: string,
  message: string,
  retryable: boolean,
  repairHint: string,
  details?: Record<string, unknown>,
): CliError {
  return new CliError({
    code,
    message,
    retryable,
    repairHint,
    ...(details ? { details } : {}),
  });
}

function splitCommaFreePath(pathname: string): string[] {
  try {
    return pathname
      .split("/")
      .filter(Boolean)
      .map((entry) => decodeURIComponent(entry));
  } catch {
    throw sourceError(
      "invalid_source",
      "Source URL contains invalid percent encoding.",
      false,
      "Use a canonical GitHub or npm HTTPS URL.",
    );
  }
}

function validGitHubPart(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value) && value !== "." && value !== "..";
}

function validPackageName(value: string): boolean {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/i.test(
    value,
  );
}

export function parseSourceTarget(raw: string): SourceTarget {
  const value = raw.trim();
  if (value.startsWith("github:")) {
    const parts = value
      .slice("github:".length)
      .replace(/\.git$/, "")
      .split("/");
    if (parts.length === 2 && parts.every(validGitHubPart))
      return { kind: "github", owner: parts[0]!, repository: parts[1]! };
  }
  if (value.startsWith("npm:")) {
    const packageName = value.slice("npm:".length);
    if (validPackageName(packageName)) return { kind: "npm", packageName };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw sourceError(
      "invalid_source",
      "Source must be a supported GitHub or npm identifier or URL.",
      false,
      "Use github:owner/repository, npm:package-name, or a canonical GitHub/npm URL.",
    );
  }
  if (url.protocol !== "https:")
    throw sourceError(
      "invalid_source",
      "Only HTTPS GitHub and npm URLs are supported.",
      false,
      "Use a canonical https://github.com or https://www.npmjs.com/package URL.",
    );
  if (url.hostname === "github.com" || url.hostname === "www.github.com") {
    const parts = splitCommaFreePath(url.pathname);
    const repository = parts[1]?.replace(/\.git$/, "") ?? "";
    if (
      parts.length === 2 &&
      validGitHubPart(parts[0] ?? "") &&
      validGitHubPart(repository)
    )
      return { kind: "github", owner: parts[0]!, repository };
  }
  if (url.hostname === "npmjs.com" || url.hostname === "www.npmjs.com") {
    const parts = splitCommaFreePath(url.pathname);
    if (parts[0] === "package") {
      const packageName = parts[1]?.startsWith("@")
        ? `${parts[1]}/${parts[2] ?? ""}`
        : (parts[1] ?? "");
      if (validPackageName(packageName)) return { kind: "npm", packageName };
    }
  }
  throw sourceError(
    "invalid_source",
    "Source URL is not a supported GitHub repository or npm package page.",
    false,
    "Use https://github.com/owner/repository or https://www.npmjs.com/package/name.",
  );
}

async function remoteJson<T>(
  url: string,
  options: {
    fetch: typeof fetch;
    service: "github" | "npm";
    headers?: HeadersInit;
    allowNotFound?: boolean;
  },
): Promise<RemoteResult<T> | null> {
  let response: Response;
  try {
    response = await options.fetch(
      url,
      options.headers ? { headers: options.headers } : {},
    );
  } catch (error) {
    throw sourceError(
      `${options.service}_unreachable`,
      error instanceof Error
        ? error.message
        : `Unable to reach ${options.service}.`,
      true,
      `Check network access to ${options.service} and retry.`,
      { url },
    );
  }
  if (response.status === 404 && options.allowNotFound) return null;
  const body = (await response.json().catch(() => null)) as T | null;
  const remoteMessage = stringValue(objectValue(body)?.["message"]);
  const rateLimited =
    response.status === 429 ||
    (options.service === "github" &&
      response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" ||
        Boolean(response.headers.get("retry-after")) ||
        Boolean(
          remoteMessage &&
          /(?:secondary |abuse )?rate limit/i.test(remoteMessage),
        )));
  if (rateLimited)
    throw sourceError(
      `${options.service}_rate_limited`,
      `${options.service === "github" ? "GitHub" : "npm"} API rate limit was exceeded.`,
      true,
      options.service === "github"
        ? "Wait for the rate limit reset or set a read-only GITHUB_TOKEN, then retry."
        : "Wait for the registry retry window, then retry.",
      {
        status: response.status,
        ...(response.headers.get("retry-after")
          ? { retryAfter: response.headers.get("retry-after") }
          : {}),
        ...(response.headers.get("x-ratelimit-reset")
          ? { rateLimitReset: response.headers.get("x-ratelimit-reset") }
          : {}),
      },
    );
  if (!response.ok)
    throw sourceError(
      `${options.service}_${response.status === 404 ? "not_found" : "request_failed"}`,
      `${options.service === "github" ? "GitHub" : "npm"} returned HTTP ${response.status}.`,
      response.status >= 500,
      response.status >= 500
        ? "Retry after the remote service recovers."
        : "Check the source identity and access, then retry.",
      { status: response.status, url },
    );
  if (body === null)
    throw sourceError(
      `${options.service}_invalid_response`,
      `${options.service === "github" ? "GitHub" : "npm"} returned invalid JSON.`,
      true,
      "Retry the source request; report the response change if it persists.",
      { url },
    );
  const etag = response.headers.get("etag");
  return { data: body, ...(etag ? { etag } : {}) };
}

function githubHeaders(token?: string): Headers {
  const headers = new Headers({
    accept: "application/vnd.github+json",
    "user-agent": "dshx-hub-cli",
    "x-github-api-version": "2022-11-28",
  });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return headers;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function droppedRemoteField(
  warnings: OperationWarning[],
  path: string,
  reason: string,
) {
  warnings.push({
    code: "remote-field-dropped",
    message: `Ignored malformed remote field ${path}.`,
    path,
    details: { reason },
  });
}

function boundedText(
  value: unknown,
  maximum: number,
  warnings: OperationWarning[],
  path: string,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim()) {
    droppedRemoteField(warnings, path, "expected a non-empty string");
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    droppedRemoteField(warnings, path, `maximum length is ${maximum}`);
    return undefined;
  }
  return normalized;
}

function httpUrlValue(
  value: unknown,
  warnings: OperationWarning[],
  path: string,
): string | undefined {
  const text = boundedText(value, 2_048, warnings, path);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol))
      throw new Error("unsupported protocol");
    return url.toString().replace(/\/$/, "");
  } catch {
    droppedRemoteField(warnings, path, "expected an HTTP or HTTPS URL");
    return undefined;
  }
}

function boundedStringList(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
  warnings: OperationWarning[],
  path: string,
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    droppedRemoteField(warnings, path, "expected an array of strings");
    return undefined;
  }
  const result: string[] = [];
  for (const [index, entry] of value.entries()) {
    const text = boundedText(
      entry,
      maximumLength,
      warnings,
      `${path}.${index}`,
    );
    if (text) result.push(text);
    if (result.length === maximumItems) break;
  }
  if (value.length > maximumItems)
    droppedRemoteField(warnings, path, `maximum item count is ${maximumItems}`);
  return result.length ? result : undefined;
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function repositoryFacts(
  repository: GitHubRepository,
  warnings: OperationWarning[] = [],
) {
  const license = objectValue(repository.license);
  const githubId =
    repository.id === undefined
      ? undefined
      : boundedText(
          String(repository.id),
          128,
          warnings,
          "facts.repository.githubId",
        );
  const fullName = boundedText(
    repository.full_name,
    300,
    warnings,
    "facts.repository.fullName",
  );
  const defaultBranch = boundedText(
    repository.default_branch,
    255,
    warnings,
    "facts.repository.defaultBranch",
  );
  const description = boundedText(
    repository.description,
    2_000,
    warnings,
    "facts.repository.description",
  );
  const homepageUrl = httpUrlValue(
    repository.homepage,
    warnings,
    "facts.repository.homepageUrl",
  );
  const topics = boundedStringList(
    repository.topics,
    100,
    100,
    warnings,
    "facts.repository.topics",
  );
  const primaryLanguage = boundedText(
    repository.language,
    100,
    warnings,
    "facts.repository.primaryLanguage",
  );
  const licenseSpdx = boundedText(
    license?.["spdx_id"],
    100,
    warnings,
    "facts.repository.licenseSpdx",
  );
  return {
    ...(githubId ? { githubId } : {}),
    ...(fullName ? { fullName } : {}),
    ...(defaultBranch ? { defaultBranch } : {}),
    ...(description ? { description } : {}),
    ...(homepageUrl ? { homepageUrl } : {}),
    ...(topics ? { topics } : {}),
    ...(primaryLanguage ? { primaryLanguage } : {}),
    ...(licenseSpdx ? { licenseSpdx } : {}),
    ...(booleanValue(repository.archived) === undefined
      ? {}
      : { archived: booleanValue(repository.archived)! }),
    ...(booleanValue(repository.disabled) === undefined
      ? {}
      : { disabled: booleanValue(repository.disabled)! }),
    ...(finiteInteger(repository.stargazers_count) === undefined
      ? {}
      : { stars: finiteInteger(repository.stargazers_count)! }),
    ...(finiteInteger(repository.forks_count) === undefined
      ? {}
      : { forks: finiteInteger(repository.forks_count)! }),
    ...(finiteInteger(repository.open_issues_count) === undefined
      ? {}
      : { openIssues: finiteInteger(repository.open_issues_count)! }),
    ...(isoDate(repository.pushed_at)
      ? { pushedAt: isoDate(repository.pushed_at)! }
      : {}),
  };
}

function publisherFacts(
  repository: GitHubRepository,
  warnings: OperationWarning[] = [],
) {
  const owner = objectValue(repository.owner);
  const githubId = boundedText(
    owner?.["id"] === undefined ? undefined : String(owner["id"]),
    128,
    warnings,
    "facts.publisher.githubId",
  );
  const login = boundedText(
    owner?.["login"],
    100,
    warnings,
    "facts.publisher.login",
  );
  const avatarUrl = httpUrlValue(
    owner?.["avatar_url"],
    warnings,
    "facts.publisher.avatarUrl",
  );
  const profileUrl = httpUrlValue(
    owner?.["html_url"],
    warnings,
    "facts.publisher.profileUrl",
  );
  const remoteKind = boundedText(
    owner?.["type"],
    50,
    warnings,
    "facts.publisher.kind",
  );
  const kind =
    remoteKind === "Organization"
      ? "organization"
      : remoteKind === "User"
        ? "user"
        : undefined;
  return githubId && login && kind && avatarUrl && profileUrl
    ? { githubId, login, kind, avatarUrl, profileUrl }
    : undefined;
}

function githubReadmeUrl(fullName: string, ref: string, path?: string): string {
  if (!path) return `https://github.com/${fullName}`;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${fullName}/blob/${encodeURIComponent(ref)}/${encodedPath}`;
}

function sourceReadmeFacts(
  content: string | null | undefined,
  sourceUrl: string,
  sourceRef: string | undefined,
  path: string | undefined,
  warnings: OperationWarning[],
) {
  if (!content)
    return {
      availability: "unavailable" as const,
      format: "markdown" as const,
      sourceUrl,
      ...(sourceRef ? { sourceRef } : {}),
      ...(path ? { path } : {}),
    };
  if (content.length > maximumReadmeCharacters) {
    warnings.push({
      code: "source-readme-too-large",
      message: `Skipped a README longer than ${maximumReadmeCharacters} characters so the original is never silently truncated.`,
      ...(path ? { path } : {}),
      details: {
        characterCount: content.length,
        maximumCharacters: maximumReadmeCharacters,
      },
    });
    return {
      availability: "unavailable" as const,
      format: "markdown" as const,
      sourceUrl,
      ...(sourceRef ? { sourceRef } : {}),
      ...(path ? { path } : {}),
    };
  }
  return {
    availability: "available" as const,
    format: "markdown" as const,
    sourceUrl,
    ...(sourceRef ? { sourceRef } : {}),
    ...(path ? { path } : {}),
    content,
    contentHash: sha256(content),
  };
}

function packageRepositoryUrl(
  manifest: Record<string, unknown>,
  warnings: OperationWarning[] = [],
  path = "facts.package.repositoryUrl",
): string | undefined {
  const repository = manifest["repository"];
  const raw =
    typeof repository === "string"
      ? repository
      : stringValue(objectValue(repository)?.["url"]);
  if (!raw) return undefined;
  let normalized = raw
    .replace(/^git\+ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/^git\+/, "")
    .replace(/^git:\/\/github\.com\//, "https://github.com/")
    .replace(/^github:/, "https://github.com/")
    .replace(/\.git$/, "");
  if (!/^https?:\/\//.test(normalized)) {
    droppedRemoteField(
      warnings,
      path,
      "expected a GitHub or HTTP(S) repository URL",
    );
    return undefined;
  }
  try {
    normalized = new URL(normalized).toString().replace(/\/$/, "");
    if (!/^https?:\/\//.test(normalized))
      throw new Error("unsupported protocol");
    if (normalized.length > 2_048) {
      droppedRemoteField(warnings, path, "maximum length is 2048");
      return undefined;
    }
    return normalized;
  } catch {
    droppedRemoteField(
      warnings,
      path,
      "expected an HTTP or HTTPS repository URL",
    );
    return undefined;
  }
}

function packageFacts(
  manifest: Record<string, unknown>,
  publishedAt?: string,
  warnings: OperationWarning[] = [],
  path = "facts.package",
): NonNullable<PluginObservationV1["facts"]>["package"] {
  const rawKeywords =
    typeof manifest["keywords"] === "string"
      ? manifest["keywords"].split(/[ ,]+/).filter(Boolean)
      : manifest["keywords"];
  const keywords = boundedStringList(
    rawKeywords,
    100,
    100,
    warnings,
    `${path}.keywords`,
  );
  const name = boundedText(manifest["name"], 214, warnings, `${path}.name`);
  const version = boundedText(
    manifest["version"],
    100,
    warnings,
    `${path}.version`,
  );
  const description = boundedText(
    manifest["description"],
    2_000,
    warnings,
    `${path}.description`,
  );
  const license = boundedText(
    manifest["license"],
    100,
    warnings,
    `${path}.license`,
  );
  const homepageUrl = httpUrlValue(
    manifest["homepage"],
    warnings,
    `${path}.homepageUrl`,
  );
  const repositoryUrl = packageRepositoryUrl(
    manifest,
    warnings,
    `${path}.repositoryUrl`,
  );
  return {
    ...(name ? { name } : {}),
    ...(version ? { version } : {}),
    ...(description ? { description } : {}),
    ...(license ? { license } : {}),
    ...(homepageUrl ? { homepageUrl } : {}),
    ...(repositoryUrl ? { repositoryUrl } : {}),
    ...(keywords?.length ? { keywords } : {}),
    ...(manifest["deprecated"] === undefined
      ? {}
      : { deprecated: Boolean(manifest["deprecated"]) }),
    ...(publishedAt ? { publishedAt } : {}),
  };
}

function patchPath(
  manifest: Record<string, unknown>,
  warnings: OperationWarning[] = [],
  path = "dsh.bundle.patch",
): string | undefined {
  const dsh = objectValue(manifest["dsh"]);
  const bundle = objectValue(dsh?.["bundle"]);
  return boundedText(bundle?.["patch"], 1_000, warnings, path);
}

function compatibility(
  manifest: Record<string, unknown>,
  warnings: OperationWarning[] = [],
  path = "facts.compatibility",
) {
  const dsh = objectValue(manifest["dsh"]);
  const declared = dsh?.["compatibility"];
  const manifestRange = boundedText(
    typeof declared === "string" ? declared : objectValue(declared)?.["range"],
    200,
    warnings,
    `${path}.declaredRange`,
  );
  if (manifestRange)
    return { declaredRange: manifestRange, source: "manifest" as const };
  const peers = objectValue(manifest["peerDependencies"]);
  for (const name of [
    "@deepseek-ai/dsh",
    "@deepseek-ai/deepseek-harness",
    "deepseek-harness",
    "dsh",
  ]) {
    const range = boundedText(
      peers?.[name],
      200,
      warnings,
      `${path}.declaredRange`,
    );
    if (range)
      return { declaredRange: range, source: "peer-dependency" as const };
  }
  return undefined;
}

function topicSignals(topics: string[]): DetectionSignal[] {
  return topics
    .filter((topic) =>
      /(?:^|[-_])(dsh|dshx|deepseek-harness)(?:$|[-_])/i.test(topic),
    )
    .map((value) => ({ kind: "topic" as const, value }));
}

function packageNameSignal(name?: string): DetectionSignal[] {
  return name && /(?:^|[-_/])(dsh|dshx|deepseek-harness)(?:$|[-_/])/i.test(name)
    ? [{ kind: "package-name", value: name }]
    : [];
}

function detectionSignals(options: {
  manifest: Record<string, unknown>;
  patchFile: boolean;
  readmeMentionsDsh: boolean;
  topics: string[];
  warnings?: OperationWarning[];
  path?: string;
}): DetectionSignal[] {
  const patch = patchPath(
    options.manifest,
    options.warnings,
    `${options.path ?? "package"}.dsh.bundle.patch`,
  );
  const packageName = boundedText(
    options.manifest["name"],
    214,
    options.warnings ?? [],
    `${options.path ?? "package"}.name`,
  );
  return [
    ...(patch ? [{ kind: "dsh.bundle.patch" as const, value: patch }] : []),
    ...(options.patchFile
      ? [{ kind: "patch-file" as const, value: "cordis.patch.yml" }]
      : []),
    ...(options.readmeMentionsDsh
      ? [{ kind: "readme" as const, value: "DSH" }]
      : []),
    ...topicSignals(options.topics),
    ...packageNameSignal(packageName),
  ];
}

function decodeBlob(value: unknown): string | null {
  const blob = objectValue(value);
  if (blob?.["encoding"] !== "base64" || typeof blob["content"] !== "string")
    return null;
  try {
    const buffer = Buffer.from(blob["content"].replaceAll("\n", ""), "base64");
    return buffer.length <= maximumManifestBytes
      ? buffer.toString("utf8")
      : null;
  } catch {
    return null;
  }
}

async function readGitHubBlob(
  fullName: string,
  entry: GitTreeEntry | undefined,
  options: { fetch: typeof fetch; headers: Headers },
  warnings: OperationWarning[],
): Promise<string | null> {
  if (typeof entry?.sha !== "string") return null;
  if (
    typeof entry.size === "number" &&
    Number.isFinite(entry.size) &&
    entry.size > maximumManifestBytes
  ) {
    const path = typeof entry.path === "string" ? entry.path : undefined;
    warnings.push({
      code: "source-file-too-large",
      message: `Skipped a source file larger than ${maximumManifestBytes} bytes.`,
      ...(path ? { path } : {}),
      details: { byteSize: entry.size, maximumBytes: maximumManifestBytes },
    });
    return null;
  }
  const result = await remoteJson<unknown>(
    `https://api.github.com/repos/${fullName}/git/blobs/${encodeURIComponent(entry.sha)}`,
    { fetch: options.fetch, service: "github", headers: options.headers },
  );
  return decodeBlob(result?.data);
}

function workspacePatterns(
  rootManifest: Record<string, unknown> | undefined,
  workspaceYaml: string | null,
): string[] {
  const workspaces = rootManifest?.["workspaces"];
  const fromPackage = Array.isArray(workspaces)
    ? workspaces
    : Array.isArray(objectValue(workspaces)?.["packages"])
      ? (objectValue(workspaces)?.["packages"] as unknown[])
      : [];
  let fromPnpm: unknown[] = [];
  if (workspaceYaml) {
    try {
      const parsed = objectValue(parseYaml(workspaceYaml));
      if (Array.isArray(parsed?.["packages"]))
        fromPnpm = parsed["packages"] as unknown[];
    } catch {
      fromPnpm = [];
    }
  }
  return [...fromPackage, ...fromPnpm]
    .filter(
      (entry): entry is string =>
        typeof entry === "string" && Boolean(entry.trim()),
    )
    .map((entry) => entry.trim());
}

function globPattern(pattern: string): RegExp {
  let normalized = pattern.replace(/^\.\//, "").replace(/\/$/, "");
  if (!normalized.endsWith("package.json")) normalized += "/package.json";
  let result = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!;
    if (character === "*" && normalized[index + 1] === "*") {
      result += ".*";
      index += 1;
    } else if (character === "*") result += "[^/]*";
    else if (character === "?") result += "[^/]";
    else result += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${result}$`);
}

function packageManifestPaths(
  entries: GitTreeEntry[],
  patterns: string[],
): string[] {
  const paths = entries
    .filter((entry) => entry.type === "blob" && typeof entry.path === "string")
    .map((entry) => entry.path as string);
  const available = new Set(paths);
  const candidates = patterns.length
    ? paths.filter((path) => {
        const includes = patterns
          .filter((pattern) => !pattern.startsWith("!"))
          .some((pattern) => globPattern(pattern).test(path));
        const excludes = patterns
          .filter((pattern) => pattern.startsWith("!"))
          .some((pattern) => globPattern(pattern.slice(1)).test(path));
        return includes && !excludes;
      })
    : paths.filter(
        (path) =>
          path === "package.json" ||
          /^(packages|plugins|extensions)\/[^/]+\/package\.json$/.test(path),
      );
  if (available.has("package.json")) candidates.push("package.json");
  return [...new Set(candidates)].sort((left, right) => {
    if (left === "package.json") return -1;
    if (right === "package.json") return 1;
    return left.localeCompare(right);
  });
}

function entryMap(entries: GitTreeEntry[]): Map<string, GitTreeEntry> {
  return new Map(
    entries
      .filter(
        (entry): entry is GitTreeEntry & { path: string } =>
          typeof entry.path === "string",
      )
      .map((entry) => [entry.path, entry]),
  );
}

function directoryOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function readmeEntryForDirectory(
  entries: GitTreeEntry[],
  directory: string,
): GitTreeEntry | undefined {
  const prefix = directory ? `${directory}/` : "";
  return entries.find(
    (entry) =>
      entry.type === "blob" &&
      typeof entry.path === "string" &&
      entry.path.startsWith(prefix) &&
      !entry.path.slice(prefix.length).includes("/") &&
      /^readme(?:\.[^.]+)?$/i.test(entry.path.slice(prefix.length)),
  );
}

function riskWarnings(
  observation: PluginObservationV1,
  repository: ReturnType<typeof repositoryFacts> | undefined,
): OperationWarning[] {
  const warnings: OperationWarning[] = [];
  const details = { identity: observation.identity };
  if (repository?.archived)
    warnings.push({
      code: "repository-archived",
      message: "The repository is archived.",
      details,
    });
  if (repository?.disabled)
    warnings.push({
      code: "repository-disabled",
      message: "The repository is disabled.",
      details,
    });
  if (observation.facts?.package?.deprecated)
    warnings.push({
      code: "package-deprecated",
      message: "The package is deprecated.",
      details,
    });
  return warnings;
}

async function inspectGitHub(
  target: Extract<SourceTarget, { kind: "github" }>,
  options: Required<Pick<InspectSourceOptions, "fetch" | "now">> & {
    githubToken?: string;
  },
): Promise<{ data: SourceInspection; warnings: OperationWarning[] }> {
  const warnings: OperationWarning[] = [];
  const headers = githubHeaders(options.githubToken);
  const requestedName = `${target.owner}/${target.repository}`;
  const repositoryResponse = await remoteJson<GitHubRepository>(
    `https://api.github.com/repos/${requestedName}`,
    { fetch: options.fetch, service: "github", headers },
  );
  const repository = repositoryResponse!.data;
  if (repository.private === true)
    throw sourceError(
      "source_not_public",
      "GitHub source inspection accepts public repositories only.",
      false,
      "Use a public GitHub repository or omit this source from Hub operations.",
    );
  const fullName = stringValue(repository.full_name) ?? requestedName;
  const repositoryId =
    repository.id === undefined ? undefined : String(repository.id);
  const defaultBranch = stringValue(repository.default_branch);
  if (!repositoryId || !defaultBranch)
    throw sourceError(
      "github_invalid_response",
      "GitHub repository metadata is missing its stable ID or default branch.",
      true,
      "Retry the inspection; report an upstream response change if it persists.",
    );
  const treeResponse = await remoteJson<GitTree>(
    `https://api.github.com/repos/${fullName}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
    { fetch: options.fetch, service: "github", headers },
  );
  const tree = treeResponse!.data;
  const entries = Array.isArray(tree.tree) ? (tree.tree as GitTreeEntry[]) : [];
  const byPath = entryMap(entries);

  const rootEntry = byPath.get("package.json");
  const rootSource = await readGitHubBlob(
    fullName,
    rootEntry,
    { fetch: options.fetch, headers },
    warnings,
  );
  let rootManifest: Record<string, unknown> | undefined;
  if (rootSource)
    try {
      rootManifest = objectValue(JSON.parse(rootSource));
    } catch {
      rootManifest = undefined;
    }
  const pnpmEntry = byPath.get("pnpm-workspace.yaml");
  const pnpmWorkspace = await readGitHubBlob(
    fullName,
    pnpmEntry,
    { fetch: options.fetch, headers },
    warnings,
  );
  const patterns = workspacePatterns(rootManifest, pnpmWorkspace);
  const allPaths = packageManifestPaths(entries, patterns);
  const selectedPaths = allPaths.slice(0, maximumPackages);
  const truncated =
    Boolean(tree.truncated) || allPaths.length > selectedPaths.length;

  const rootReadmeEntry = readmeEntryForDirectory(entries, "");
  const rootReadme = await readGitHubBlob(
    fullName,
    rootReadmeEntry,
    { fetch: options.fetch, headers },
    warnings,
  );
  const factsRepository = repositoryFacts(repository, warnings);
  const factsPublisher = publisherFacts(repository, warnings);
  const topics = factsRepository.topics ?? [];
  const observedAt = options.now().toISOString();
  const observations: PluginObservationV1[] = [];

  for (const path of selectedPaths) {
    const entry = byPath.get(path);
    if (typeof entry?.sha !== "string") continue;
    const source =
      path === "package.json"
        ? rootSource
        : await readGitHubBlob(
            fullName,
            entry,
            { fetch: options.fetch, headers },
            warnings,
          );
    if (!source) {
      warnings.push({
        code: "package-manifest-unavailable",
        message: `Could not read ${path}.`,
        path,
      });
      continue;
    }
    let manifest: Record<string, unknown> | undefined;
    try {
      manifest = objectValue(JSON.parse(source));
    } catch {
      manifest = undefined;
    }
    if (!manifest) {
      warnings.push({
        code: "invalid-package-manifest",
        message: `${path} is not a JSON object.`,
        path,
      });
      continue;
    }
    const directory = directoryOf(path);
    const packageReadmeEntry =
      directory === ""
        ? rootReadmeEntry
        : readmeEntryForDirectory(entries, directory);
    const packageReadme =
      directory === ""
        ? rootReadme
        : await readGitHubBlob(
            fullName,
            packageReadmeEntry,
            { fetch: options.fetch, headers },
            warnings,
          );
    const selectedReadmeEntry = packageReadmeEntry ?? rootReadmeEntry;
    const selectedReadme = packageReadme ?? rootReadme;
    const selectedReadmePath =
      typeof selectedReadmeEntry?.path === "string"
        ? selectedReadmeEntry.path
        : undefined;
    const readmeFacts = sourceReadmeFacts(
      selectedReadme,
      githubReadmeUrl(fullName, defaultBranch, selectedReadmePath),
      defaultBranch,
      selectedReadmePath,
      warnings,
    );
    const patchFile = byPath.has(
      directory ? `${directory}/cordis.patch.yml` : "cordis.patch.yml",
    );
    const signals = detectionSignals({
      manifest,
      patchFile,
      readmeMentionsDsh: Boolean(
        packageReadme && /\bDSH\b|DeepSeek Harness/i.test(packageReadme),
      ),
      topics,
      warnings,
      path,
    });
    if (!signals.length) continue;
    const factsPackage = packageFacts(
      manifest,
      undefined,
      warnings,
      `${path}.facts.package`,
    );
    const packageName = factsPackage?.name;
    const version = factsPackage?.version;
    const compatibilityFacts = compatibility(
      manifest,
      warnings,
      `${path}.facts.compatibility`,
    );
    const contentHash = sha256(
      canonicalJson({
        manifest,
        repository: factsRepository,
        packagePath: directory,
        tree: stringValue(tree.sha),
      }),
    );
    const observationSource: ObservationSource = {
      kind: "github",
      url: `https://github.com/${fullName}`,
      ref: defaultBranch,
      contentHash,
      availability: "available",
    };
    const identity = {
      kind: "github" as const,
      repositoryId,
      fullName,
      subdirectory: directory,
    };
    const targets = [
      {
        kind: "github" as const,
        spec: `github:${fullName}#${defaultBranch}`,
        ...(packageName ? { packageName } : {}),
        ...(version ? { version } : {}),
        packagePath: directory,
        primary: true,
        available: true,
      },
      ...(packageName && version
        ? [
            {
              kind: "npm" as const,
              spec: `${packageName}@${version}`,
              packageName,
              version,
              packagePath: directory,
              primary: false,
              available: false,
            },
          ]
        : []),
    ];
    const observation = parsePluginObservation({
      schemaVersion: 1,
      observationId: observationIdFor(identity, observationSource),
      observedAt,
      identity,
      source: observationSource,
      detection: { signals },
      facts: {
        package: factsPackage,
        repository: factsRepository,
        ...(factsPublisher ? { publisher: factsPublisher } : {}),
        readme: readmeFacts,
        installTargets: targets,
        ...(compatibilityFacts ? { compatibility: compatibilityFacts } : {}),
        metrics: {
          ...(factsRepository.stars === undefined
            ? {}
            : { githubStars: factsRepository.stars }),
          ...(factsRepository.forks === undefined
            ? {}
            : { githubForks: factsRepository.forks }),
          ...(factsRepository.openIssues === undefined
            ? {}
            : { githubOpenIssues: factsRepository.openIssues }),
        },
      },
    });
    observations.push(observation);
    warnings.push(...riskWarnings(observation, factsRepository));
  }

  if (truncated)
    warnings.push({
      code: "workspace-truncated",
      message: `Workspace discovery was limited to ${maximumPackages} package manifests.`,
      details: { maximumPackages, discoveredPackages: allPaths.length },
    });
  if (!observations.length)
    warnings.push({
      code: "no-plugin-signals",
      message: "No package with a DSH plugin signal was found.",
    });
  return {
    data: {
      source: { kind: "github", canonical: `github:${fullName}` },
      observations,
      truncated,
    },
    warnings,
  };
}

function githubTargetFromRepositoryUrl(
  value?: string,
): Extract<SourceTarget, { kind: "github" }> | null {
  if (!value) return null;
  try {
    const parsed = parseSourceTarget(value);
    return parsed.kind === "github" ? parsed : null;
  } catch {
    return null;
  }
}

async function optionalGitHubFacts(
  target: Extract<SourceTarget, { kind: "github" }> | null,
  options: Required<Pick<InspectSourceOptions, "fetch">> & {
    githubToken?: string;
  },
  warnings: OperationWarning[],
): Promise<
  | {
      repository: ReturnType<typeof repositoryFacts>;
      publisher: ReturnType<typeof publisherFacts>;
    }
  | undefined
> {
  if (!target) return undefined;
  const response = await remoteJson<GitHubRepository>(
    `https://api.github.com/repos/${target.owner}/${target.repository}`,
    {
      fetch: options.fetch,
      service: "github",
      headers: githubHeaders(options.githubToken),
      allowNotFound: true,
    },
  );
  return response
    ? {
        repository: repositoryFacts(response.data, warnings),
        publisher: publisherFacts(response.data, warnings),
      }
    : undefined;
}

async function inspectNpm(
  target: Extract<SourceTarget, { kind: "npm" }>,
  options: Required<Pick<InspectSourceOptions, "fetch" | "now">> & {
    githubToken?: string;
  },
): Promise<{ data: SourceInspection; warnings: OperationWarning[] }> {
  const encoded = encodeURIComponent(target.packageName);
  const registryUrl = `https://registry.npmjs.org/${encoded}`;
  const response = await remoteJson<Record<string, unknown>>(registryUrl, {
    fetch: options.fetch,
    service: "npm",
    headers: { accept: "application/json", "user-agent": "dshx-hub-cli" },
  });
  const metadata = response!.data;
  const warnings: OperationWarning[] = [];
  const distTags = objectValue(metadata["dist-tags"]);
  const version = boundedText(
    distTags?.["latest"],
    100,
    warnings,
    "source.ref",
  );
  const versions = objectValue(metadata["versions"]);
  const manifest = version ? objectValue(versions?.[version]) : undefined;
  if (!version || !manifest)
    throw sourceError(
      "npm_invalid_response",
      "npm metadata does not contain a readable latest package manifest.",
      true,
      "Retry the inspection; report an upstream registry response change if it persists.",
    );
  const canonicalName = boundedText(
    manifest["name"],
    214,
    warnings,
    "identity.packageName",
  );
  if (
    !canonicalName ||
    canonicalName !== canonicalName.toLowerCase() ||
    !validPackageName(canonicalName)
  )
    throw sourceError(
      "npm_invalid_response",
      "npm metadata does not contain a canonical package name.",
      false,
      "Check the registry package identity before retrying.",
    );
  const repositoryUrl = packageRepositoryUrl(manifest, warnings);
  let githubSource:
    | {
        repository: ReturnType<typeof repositoryFacts>;
        publisher: ReturnType<typeof publisherFacts>;
      }
    | undefined;
  try {
    githubSource = await optionalGitHubFacts(
      githubTargetFromRepositoryUrl(repositoryUrl),
      options,
      warnings,
    );
  } catch (error) {
    if (error instanceof CliError)
      warnings.push({
        code: error.issue.code,
        message: `Package metadata was read, but repository metadata was unavailable: ${error.issue.message}`,
      });
    else throw error;
  }
  const githubFacts = githubSource?.repository;
  const readme =
    typeof metadata["readme"] === "string" && metadata["readme"].trim()
      ? metadata["readme"]
      : undefined;
  const npmReadmeUrl = `https://www.npmjs.com/package/${target.packageName
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const readmeFacts = sourceReadmeFacts(
    readme,
    npmReadmeUrl,
    version,
    "README.md",
    warnings,
  );
  const topics = githubFacts?.topics ?? [];
  const signals = detectionSignals({
    manifest,
    patchFile: false,
    readmeMentionsDsh: Boolean(
      readme && /\bDSH\b|DeepSeek Harness/i.test(readme),
    ),
    topics,
    warnings,
    path: "facts.package",
  });
  const time = objectValue(metadata["time"]);
  const publishedAt = isoDate(time?.[version]);
  const contentHash = sha256(
    canonicalJson({ manifest, repository: githubFacts, readme }),
  );
  const etag = boundedText(response!.etag, 500, warnings, "source.etag");
  const observationSource: ObservationSource = {
    kind: "npm",
    url: registryUrl,
    ref: version,
    ...(etag ? { etag } : { contentHash }),
    availability: "available",
  };
  const identity = { kind: "npm" as const, packageName: canonicalName };
  const factsPackage = packageFacts(manifest, publishedAt, warnings);
  const compatibilityFacts = compatibility(manifest, warnings);
  const observation = parsePluginObservation({
    schemaVersion: 1,
    observationId: observationIdFor(identity, observationSource),
    observedAt: options.now().toISOString(),
    identity,
    source: observationSource,
    detection: { signals },
    facts: {
      package: factsPackage,
      ...(githubFacts ? { repository: githubFacts } : {}),
      ...(githubSource?.publisher ? { publisher: githubSource.publisher } : {}),
      readme: readmeFacts,
      installTargets: [
        {
          kind: "npm",
          spec: `${canonicalName}@${version}`,
          packageName: canonicalName,
          version,
          primary: true,
          available: true,
        },
      ],
      ...(compatibilityFacts ? { compatibility: compatibilityFacts } : {}),
      ...(githubFacts
        ? {
            metrics: {
              ...(githubFacts.stars === undefined
                ? {}
                : { githubStars: githubFacts.stars }),
              ...(githubFacts.forks === undefined
                ? {}
                : { githubForks: githubFacts.forks }),
              ...(githubFacts.openIssues === undefined
                ? {}
                : { githubOpenIssues: githubFacts.openIssues }),
            },
          }
        : {}),
    },
  });
  warnings.push(...riskWarnings(observation, githubFacts));
  if (!signals.length)
    warnings.push({
      code: "no-plugin-signals",
      message:
        "The package was inspected, but no DSH plugin detection signal was found.",
      details: { identity: observation.identity },
    });
  return {
    data: {
      source: { kind: "npm", canonical: `npm:${canonicalName}` },
      observations: [observation],
      truncated: false,
    },
    warnings,
  };
}

export async function inspectSource(
  raw: string,
  options: InspectSourceOptions = {},
): Promise<{ data: SourceInspection; warnings: OperationWarning[] }> {
  const target = parseSourceTarget(raw);
  const token =
    options.githubToken ??
    process.env["GITHUB_TOKEN"] ??
    process.env["GH_TOKEN"];
  const resolved = {
    fetch: options.fetch ?? globalThis.fetch,
    now: options.now ?? (() => new Date()),
    ...(token ? { githubToken: token } : {}),
  };
  return target.kind === "github"
    ? inspectGitHub(target, resolved)
    : inspectNpm(target, resolved);
}
