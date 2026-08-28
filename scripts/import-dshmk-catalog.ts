import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  parsePluginObservation,
  type PluginObservationV1,
} from "../packages/framework-hub-cli/dist/contracts.js";
import {
  curatePlugin,
  getPlugin,
  publishReport,
  upsertPlugins,
} from "../packages/framework-hub-cli/dist/operations.js";

type InstallCandidate = {
  executable?: boolean;
  source?: "github" | "npm" | string;
  specifier?: string;
};

type SourceRepository = {
  archived?: boolean;
  categories?: string[];
  category?: string;
  createdAt?: string;
  defaultBranch?: string;
  description?: string;
  fork?: boolean;
  forks?: number;
  fullName: string;
  homepage?: string | null;
  install?: { candidates?: InstallCandidate[]; status?: string };
  language?: string | null;
  license?: string | null;
  name: string;
  openIssues?: number;
  owner?: { avatarUrl?: string; login?: string };
  pushedAt?: string;
  repositoryId: number;
  slug: string;
  stars?: number;
  topics?: string[];
  projectType?: string;
  url: string;
  validation?: {
    eligible?: boolean;
    overall?: string;
    sourceSha?: string;
  };
};

type SourceCatalog = {
  generatedAt: string;
  repositories: SourceRepository[];
  schemaVersion: number;
};

type GraphRepository = {
  databaseId: number;
  defaultBranchRef?: { name?: string } | null;
  description?: string | null;
  forkCount: number;
  homepageUrl?: string | null;
  isArchived: boolean;
  isDisabled: boolean;
  issues: { totalCount: number };
  licenseInfo?: { spdxId?: string | null } | null;
  nameWithOwner: string;
  owner: {
    __typename: "Organization" | "User";
    avatarUrl: string;
    databaseId: number;
    login: string;
    url: string;
  };
  primaryLanguage?: { name?: string } | null;
  pushedAt?: string | null;
  repositoryTopics?: {
    nodes?: Array<{ topic?: { name?: string } | null } | null>;
  } | null;
  stargazerCount: number;
  url: string;
};

type PreparedCandidate = {
  candidate: SourceRepository;
  curation?: {
    categories: string[];
    derivedFrom: string[];
    displayName: { en: string; zh: string };
    overviewMarkdown: { en: string; zh: string };
    shortDescription: { en: string; zh: string };
    sourceReadmeHash: string;
    tags: string[];
  };
  directObservation?: PluginObservationV1;
  reason?: string;
};

type ImportCache = {
  blockedIdentities?: string[];
  completed?: boolean;
  generatedAt?: string;
  selectedIdentities?: string[];
  translations?: Record<string, string>;
};

type ExistingCatalog = {
  curatedIdentities: Set<string>;
  directIdentities: Set<string>;
  identities: Set<string>;
  importedIdentities: Set<string>;
  packageNames: Set<string>;
  pluginIds: Map<string, string>;
  publishedIdentities: Set<string>;
  repositories: Set<string>;
  shortSeoIdentities: Set<string>;
};

const upstreamUrl = "https://api.dshmk.com/";
const hub = optionValue("--hub") ?? "https://dshx.io";
const apply = process.argv.includes("--apply");
const requestedLimit = numberOption("--limit");
const requestedIdentities = optionValues("--identity");
const repairShortSeo = process.argv.includes("--repair-short-seo");
const recurate = process.argv.includes("--recurate");
const concurrency = numberOption("--concurrency") ?? 8;
const cachePath = join(tmpdir(), "dshx-public-catalog-import-v1.json");
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hubDirectory = join(workspace, "apps/framework-hub");
const startedAt = new Date();
const runId = randomUUID();

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function optionValues(name: string): string[] {
  return process.argv.flatMap((value, index, values) =>
    value === name && values[index + 1] ? [values[index + 1]] : [],
  );
}

function numberOption(name: string): number | undefined {
  const raw = optionValue(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer.`);
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function loadCache(): ImportCache {
  if (!existsSync(cachePath)) return { translations: {} };
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8")) as ImportCache;
    return {
      ...parsed,
      blockedIdentities: parsed.blockedIdentities ?? [],
      translations: parsed.translations ?? {},
    };
  } catch {
    return { translations: {} };
  }
}

function saveCache(cache: ImportCache): void {
  writeFileSync(cachePath, `${JSON.stringify(cache)}\n`);
}

function productionCatalog(): ExistingCatalog {
  const args = [
    "exec",
    "wrangler",
    "d1",
    "execute",
    "dshx-framework-hub",
    "--remote",
    "--command",
    `select i.identity_key,i.plugin_id,p.package_name,p.repository_url,
      exists(select 1 from plugin_observations o where o.identity_key=i.identity_key and o.source_url like 'https://dshmk.com/plugins/%') imported,
      exists(select 1 from plugin_observations o where o.identity_key=i.identity_key and o.source_kind in ('github','npm')) direct,
      exists(select 1 from plugin_curations c where c.plugin_id=i.plugin_id) curated,
      case when s.state='published' then 1 else 0 end published,
      exists(select 1 from plugin_localizations l where l.plugin_id=i.plugin_id and ((l.locale='en' and length(l.seo_description)<48) or (l.locale='zh' and length(l.seo_description)<24))) short_seo
    from plugin_observation_identities i
    join plugins p on p.id=i.plugin_id
    left join plugin_operational_state s on s.plugin_id=i.plugin_id
    union all
    select null identity_key,p.id plugin_id,p.package_name,p.repository_url,0 imported,0 direct,0 curated,0 published,0 short_seo from plugins p`,
    "--json",
  ];
  let output = "";
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      output = execFileSync("pnpm", args, {
        cwd: hubDirectory,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!output)
    throw new Error("Production catalog identity query failed.", {
      cause: lastError,
    });
  const parsed = JSON.parse(output) as Array<{
    results?: Array<{
      identity_key?: string;
      plugin_id?: string;
      package_name?: string;
      repository_url?: string;
      imported?: number;
      direct?: number;
      curated?: number;
      published?: number;
      short_seo?: number;
    }>;
    success?: boolean;
  }>;
  if (!parsed[0]?.success)
    throw new Error("Production catalog identity query did not succeed.");
  const rows = parsed[0].results ?? [];
  const identifiedRows = rows.filter(
    (row): row is typeof row & { identity_key: string } =>
      Boolean(row.identity_key),
  );
  return {
    curatedIdentities: new Set(
      identifiedRows
        .filter((row) => row.curated === 1)
        .map((row) => row.identity_key),
    ),
    directIdentities: new Set(
      identifiedRows
        .filter((row) => row.direct === 1)
        .map((row) => row.identity_key),
    ),
    identities: new Set(identifiedRows.map((row) => row.identity_key)),
    importedIdentities: new Set(
      identifiedRows
        .filter((row) => row.imported === 1)
        .map((row) => row.identity_key),
    ),
    packageNames: new Set(
      rows
        .map((row) => row.package_name?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ),
    repositories: new Set(
      rows
        .map((row) => repositoryName(row.repository_url))
        .filter((value): value is string => Boolean(value)),
    ),
    shortSeoIdentities: new Set(
      identifiedRows
        .filter((row) => row.short_seo === 1)
        .map((row) => row.identity_key),
    ),
    pluginIds: new Map(
      identifiedRows.flatMap((row) =>
        row.plugin_id ? [[row.identity_key, row.plugin_id] as const] : [],
      ),
    ),
    publishedIdentities: new Set(
      identifiedRows
        .filter((row) => row.published === 1)
        .map((row) => row.identity_key),
    ),
  };
}

function productionBookmark(): string {
  const output = execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "time-travel",
      "info",
      "dshx-framework-hub",
      "--json",
    ],
    {
      cwd: hubDirectory,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const parsed = JSON.parse(output) as { bookmark?: string };
  if (!parsed.bookmark) throw new Error("Production D1 bookmark is missing.");
  return parsed.bookmark;
}

function repositoryName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.hostname.toLowerCase() !== "github.com") return undefined;
    const path = parsed.pathname
      .split("/")
      .filter(Boolean)
      .join("/")
      .replace(/\.git$/i, "")
      .toLowerCase();
    return path || undefined;
  } catch {
    return undefined;
  }
}

function alreadyPresent(candidate: SourceRepository, current: ExistingCatalog) {
  const identity = identityFor(candidate);
  if (current.identities.has(identity)) return true;
  const install = executableCandidate(candidate)!;
  if (
    install.source === "npm" &&
    current.packageNames.has(npmSpecifier(install.specifier ?? "").name)
  )
    return true;
  return current.repositories.has(candidate.fullName.toLowerCase());
}

async function retry<T>(
  label: string,
  action: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(30_000, 1_000 * 2 ** (attempt - 1))),
        );
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts.`, {
    cause: lastError,
  });
}

async function fetchResponse(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return retry(url, async () => {
    const response = await fetch(url, {
      ...init,
      headers: {
        accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        "user-agent": "DSHX-Framework-Hub/0.1 public-catalog-maintenance",
        ...Object.fromEntries(new Headers(init.headers).entries()),
      },
    });
    if (response.status === 404) return response;
    if (!response.ok)
      throw new Error(`${url} returned HTTP ${response.status}.`);
    return response;
  });
}

async function mapConcurrent<T, U>(
  items: T[],
  limit: number,
  action: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await action(items[index]!, index);
      }
    }),
  );
  return results;
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size)
    output.push(items.slice(offset, offset + size));
  return output;
}

function npmSpecifier(raw: string): { name: string; selector?: string } {
  const value = raw.startsWith("npm:") ? raw.slice(4) : raw;
  const separator = value.lastIndexOf("@");
  if (separator > 0)
    return {
      name: value.slice(0, separator).toLowerCase(),
      selector: value.slice(separator + 1),
    };
  return { name: value.toLowerCase() };
}

function executableCandidate(
  candidate: SourceRepository,
): InstallCandidate | undefined {
  const matches =
    candidate.install?.candidates?.filter((item) => item.executable === true) ??
    [];
  return matches.length === 1 ? matches[0] : undefined;
}

function identityFor(candidate: SourceRepository): string {
  const install = executableCandidate(candidate);
  if (!install?.specifier)
    throw new Error(`${candidate.fullName} has no exact executable target.`);
  return install.source === "npm"
    ? `npm:${npmSpecifier(install.specifier).name}`
    : `github:${String(candidate.repositoryId)}:`;
}

function operationIdentity(candidate: SourceRepository) {
  const identity = identityFor(candidate);
  if (identity.startsWith("npm:"))
    return { kind: "npm" as const, packageName: identity.slice(4) };
  return {
    kind: "github" as const,
    repositoryId: String(candidate.repositoryId),
    fullName: candidate.fullName,
    subdirectory: "",
  };
}

function bounded(value: unknown, maximum: number): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maximum)
    : undefined;
}

function validUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function sourceRepositoryFacts(candidate: SourceRepository) {
  return {
    githubId: String(candidate.repositoryId),
    fullName: candidate.fullName,
    ...(bounded(candidate.defaultBranch, 255)
      ? { defaultBranch: bounded(candidate.defaultBranch, 255) }
      : {}),
    ...(bounded(candidate.description, 2_000)
      ? { description: bounded(candidate.description, 2_000) }
      : {}),
    ...(validUrl(candidate.homepage)
      ? { homepageUrl: validUrl(candidate.homepage) }
      : {}),
    topics: (candidate.topics ?? []).filter(Boolean).slice(0, 100),
    ...(bounded(candidate.language, 100)
      ? { primaryLanguage: bounded(candidate.language, 100) }
      : {}),
    ...(bounded(candidate.license, 100)
      ? { licenseSpdx: bounded(candidate.license, 100) }
      : {}),
    archived: candidate.archived === true,
    stars: Math.max(0, candidate.stars ?? 0),
    forks: Math.max(0, candidate.forks ?? 0),
    openIssues: Math.max(0, candidate.openIssues ?? 0),
    ...(candidate.pushedAt ? { pushedAt: candidate.pushedAt } : {}),
  };
}

function discoveryObservation(
  candidate: SourceRepository,
  generatedAt: string,
): PluginObservationV1 {
  const install = executableCandidate(candidate)!;
  const identity = operationIdentity(candidate);
  const source = {
    kind: "manual" as const,
    url: `https://dshmk.com/plugins/${candidate.slug}`,
    ref: generatedAt,
    contentHash: sha256(canonicalJson(candidate)),
    availability: "available" as const,
  };
  const exactNpm =
    install.source === "npm" ? npmSpecifier(install.specifier ?? "") : null;
  const npmVersion =
    exactNpm?.selector &&
    /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(exactNpm.selector)
      ? exactNpm.selector.replace(/^v/, "")
      : undefined;
  const installTargets =
    install.source === "github" && install.specifier?.includes("#")
      ? [
          {
            kind: "github" as const,
            spec: install.specifier,
            primary: true,
            available: true,
          },
        ]
      : exactNpm && npmVersion
        ? [
            {
              kind: "npm" as const,
              spec: `${exactNpm.name}@${npmVersion}`,
              packageName: exactNpm.name,
              version: npmVersion,
              primary: true,
              available: true,
            },
          ]
        : [];
  return parsePluginObservation({
    schemaVersion: 1,
    observedAt: generatedAt,
    identity,
    source,
    detection: {
      signals: [
        { kind: "topic", value: "dsh-plugin" },
        { kind: "manual", value: "public catalog discovery" },
      ],
    },
    facts: {
      repository: sourceRepositoryFacts(candidate),
      ...(identity.kind === "npm" && npmVersion
        ? {
            package: {
              name: identity.packageName,
              version: npmVersion,
              ...(bounded(candidate.description, 2_000)
                ? { description: bounded(candidate.description, 2_000) }
                : {}),
            },
          }
        : {}),
      ...(installTargets.length ? { installTargets } : {}),
      metrics: {
        githubStars: Math.max(0, candidate.stars ?? 0),
        githubForks: Math.max(0, candidate.forks ?? 0),
        githubOpenIssues: Math.max(0, candidate.openIssues ?? 0),
      },
    },
  });
}

function githubToken(): string {
  const environmentToken = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (environmentToken) return environmentToken;
  return execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
}

async function graphRepositories(
  candidates: SourceRepository[],
): Promise<Map<string, GraphRepository>> {
  const token = githubToken();
  const output = new Map<string, GraphRepository>();
  for (const batch of chunks(candidates, 35)) {
    const fields = batch
      .map((candidate, index) => {
        const [owner, name] = candidate.fullName.split("/");
        return `r${index}: repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}) {
        databaseId nameWithOwner url description homepageUrl isArchived isDisabled stargazerCount forkCount pushedAt
        issues(states:OPEN) { totalCount }
        defaultBranchRef { name }
        primaryLanguage { name }
        licenseInfo { spdxId }
        repositoryTopics(first:30) { nodes { topic { name } } }
        owner { __typename login avatarUrl url ... on User { databaseId } ... on Organization { databaseId } }
      }`;
      })
      .join("\n");
    const response = await fetchResponse("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: `query CatalogRepositories { ${fields} }`,
      }),
    });
    const body = (await response.json()) as {
      data?: Record<string, GraphRepository | null>;
      errors?: unknown[];
    };
    if (body.errors?.length)
      throw new Error(
        `GitHub GraphQL returned errors: ${JSON.stringify(body.errors)}`,
      );
    batch.forEach((candidate, index) => {
      const repository = body.data?.[`r${index}`];
      if (repository) output.set(candidate.fullName.toLowerCase(), repository);
    });
  }
  return output;
}

function graphRepositoryFacts(repository: GraphRepository) {
  const topics =
    repository.repositoryTopics?.nodes
      ?.map((node) => node?.topic?.name)
      .filter((value): value is string => Boolean(value)) ?? [];
  return {
    githubId: String(repository.databaseId),
    fullName: repository.nameWithOwner,
    ...(bounded(repository.defaultBranchRef?.name, 255)
      ? { defaultBranch: bounded(repository.defaultBranchRef?.name, 255) }
      : {}),
    ...(bounded(repository.description, 2_000)
      ? { description: bounded(repository.description, 2_000) }
      : {}),
    ...(validUrl(repository.homepageUrl)
      ? { homepageUrl: validUrl(repository.homepageUrl) }
      : {}),
    topics,
    ...(bounded(repository.primaryLanguage?.name, 100)
      ? { primaryLanguage: bounded(repository.primaryLanguage?.name, 100) }
      : {}),
    ...(bounded(repository.licenseInfo?.spdxId, 100)
      ? { licenseSpdx: bounded(repository.licenseInfo?.spdxId, 100) }
      : {}),
    archived: repository.isArchived,
    disabled: repository.isDisabled,
    stars: repository.stargazerCount,
    forks: repository.forkCount,
    openIssues: repository.issues.totalCount,
    ...(repository.pushedAt ? { pushedAt: repository.pushedAt } : {}),
  };
}

function publisherFacts(repository: GraphRepository) {
  return {
    githubId: String(repository.owner.databaseId),
    login: repository.owner.login,
    kind:
      repository.owner.__typename === "Organization"
        ? ("organization" as const)
        : ("user" as const),
    avatarUrl: repository.owner.avatarUrl,
    profileUrl: repository.owner.url,
  };
}

async function rawFile(
  candidate: SourceRepository,
  paths: string[],
): Promise<{ content: string; path: string; url: string } | undefined> {
  const ref = candidate.validation?.sourceSha;
  if (!ref) return undefined;
  for (const path of paths) {
    const url = `https://raw.githubusercontent.com/${candidate.fullName}/${ref}/${path}`;
    const response = await fetchResponse(url);
    if (response.status === 404) continue;
    const content = await response.text();
    if (content.trim() && content.length <= 200_000)
      return { content, path, url };
  }
  return undefined;
}

async function packageReadme(
  packageName: string,
  version: string,
): Promise<{ content: string; path: string; url: string } | undefined> {
  const encodedName = packageName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  for (const path of [
    "README.md",
    "readme.md",
    "Readme.md",
    "README.MD",
    "README.zh-CN.md",
  ]) {
    const url = `https://unpkg.com/${encodedName}@${encodeURIComponent(version)}/${path}`;
    const response = await fetchResponse(url);
    if (response.status === 404) continue;
    const content = await response.text();
    if (content.trim() && content.length <= 200_000)
      return { content, path, url };
  }
  return undefined;
}

function packageRepositoryUrl(
  manifest: Record<string, unknown>,
): string | undefined {
  const repository = manifest.repository;
  const raw =
    typeof repository === "string"
      ? repository
      : repository &&
          typeof repository === "object" &&
          typeof (repository as { url?: unknown }).url === "string"
        ? (repository as { url: string }).url
        : undefined;
  if (!raw) return undefined;
  const normalized = raw
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "");
  return validUrl(normalized);
}

function packageFacts(
  manifest: Record<string, unknown>,
  fallbackName?: string,
) {
  const name = bounded(manifest.name, 214) ?? fallbackName;
  const version = bounded(manifest.version, 100);
  if (!name || !version) return undefined;
  const keywords = Array.isArray(manifest.keywords)
    ? manifest.keywords
        .filter(
          (value): value is string =>
            typeof value === "string" && Boolean(value.trim()),
        )
        .map((value) => value.slice(0, 100))
        .slice(0, 100)
    : typeof manifest.keywords === "string"
      ? manifest.keywords.split(/[ ,]+/).filter(Boolean).slice(0, 100)
      : undefined;
  const repositoryUrl = packageRepositoryUrl(manifest);
  return {
    name,
    version,
    ...(bounded(manifest.description, 2_000)
      ? { description: bounded(manifest.description, 2_000) }
      : {}),
    ...(bounded(manifest.license, 100)
      ? { license: bounded(manifest.license, 100) }
      : {}),
    ...(validUrl(manifest.homepage)
      ? { homepageUrl: validUrl(manifest.homepage) }
      : {}),
    ...(repositoryUrl ? { repositoryUrl } : {}),
    ...(keywords?.length ? { keywords } : {}),
    ...(manifest.deprecated === true || typeof manifest.deprecated === "string"
      ? { deprecated: true }
      : {}),
  };
}

function compatibility(manifest: Record<string, unknown>) {
  const peerDependencies =
    manifest.peerDependencies && typeof manifest.peerDependencies === "object"
      ? (manifest.peerDependencies as Record<string, unknown>)
      : {};
  const engines =
    manifest.engines && typeof manifest.engines === "object"
      ? (manifest.engines as Record<string, unknown>)
      : {};
  const declaredRange = bounded(
    peerDependencies["deepseek-harness"] ??
      engines["deepseek-harness"] ??
      engines.dsh,
    200,
  );
  return declaredRange
    ? { declaredRange, source: "peer-dependency" as const }
    : undefined;
}

function cleanMarkdownLine(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_>#]/g, "")
    .replace(/^[-+•]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningful(value: string | undefined): value is string {
  if (!value) return false;
  const normalized = cleanMarkdownLine(value);
  return (
    normalized.length >= 24 &&
    normalized !== "该仓库暂未提供项目说明。" &&
    !normalized.includes("????") &&
    !/^DeepSeek Harness (?:plugin|插件)[.!。]?$/.test(normalized)
  );
}

function capabilityEvidence(value: string): boolean {
  const normalized = cleanMarkdownLine(value);
  return (
    meaningful(normalized) &&
    !/(?:if you (?:are|run)|from source|repo(?:sitory)? root|checkout|clone|installation|install with|npm (?:install|run)|pnpm|yarn|\bcd\s|如果|源码运行|仓库根目录|安装命令)/iu.test(
      normalized,
    ) &&
    !/\b(?:is|are|the|and|or|to|for|with|of|a|an)$/iu.test(normalized)
  );
}

function readmeEvidence(readme: string): {
  intro?: string;
  features: string[];
} {
  const withoutCode = readme.replace(/```[\s\S]*?```/g, "\n");
  const lines = withoutCode.split(/\r?\n/);
  const paragraphs: string[] = [];
  const bullets: string[] = [];
  const preferredBullets: string[] = [];
  let paragraph: string[] = [];
  let bullet: string[] = [];
  let preferredSection = false;
  let bulletIsPreferred = false;
  const flush = () => {
    const value = cleanMarkdownLine(paragraph.join(" "));
    if (meaningful(value) && value.length <= 700) paragraphs.push(value);
    paragraph = [];
  };
  const flushBullet = () => {
    const value = cleanMarkdownLine(bullet.join(" "));
    if (
      capabilityEvidence(value) &&
      value.length <= 700 &&
      !/install|安装|clone|license|许可证/i.test(value)
    )
      (bulletIsPreferred ? preferredBullets : bullets).push(value);
    bullet = [];
  };
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      flush();
      flushBullet();
      continue;
    }
    if (
      /^(?:\[!|<img|https?:\/\/|npm |pnpm |yarn |dsh plugin)/i.test(trimmed)
    ) {
      flush();
      flushBullet();
      continue;
    }
    if (/^#{1,6}\s/.test(trimmed)) {
      flush();
      flushBullet();
      preferredSection =
        /(?:features?|highlights?|capabilit|功能|特性|主要能力)/iu.test(
          trimmed,
        );
      continue;
    }
    if (/^[-+*•]\s+/.test(trimmed)) {
      flush();
      flushBullet();
      bullet = [trimmed];
      bulletIsPreferred = preferredSection;
      continue;
    }
    if (bullet.length && /^\s{2,}\S/.test(raw)) {
      bullet.push(trimmed);
      continue;
    }
    flushBullet();
    paragraph.push(trimmed);
  }
  flush();
  flushBullet();
  const preferred = [...new Set(preferredBullets)];
  const unique = [...new Set(bullets)];
  const intro = paragraphs.find(meaningful);
  if (preferred.length) return { intro, features: preferred.slice(0, 5) };
  const fallback = paragraphs
    .filter((value) => value !== intro && capabilityEvidence(value))
    .slice(0, 4);
  return { intro, features: fallback.length ? fallback : unique.slice(0, 5) };
}

function inferLanguage(value: string): "en" | "zh" {
  const cjk = (value.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWords = (value.match(/[A-Za-z]{3,}/g) ?? []).length;
  return cjk >= latinWords * 2 ? "zh" : "en";
}

function trimText(value: string, maximum: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maximum) return clean;
  const clipped = clean.slice(0, maximum - 1);
  const boundary = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("。"),
    clipped.lastIndexOf("；"),
    clipped.lastIndexOf("; "),
    clipped.lastIndexOf(", "),
    clipped.lastIndexOf("，"),
  );
  return `${(boundary > maximum * 0.55 ? clipped.slice(0, boundary + 1) : clipped).trim()}…`;
}

function buildShortDescription(input: {
  description: string;
  features: string[];
  locale: "en" | "zh";
}): string {
  let summary = trimText(input.description, 240);
  for (const feature of input.features) {
    const substantive =
      input.locale === "en"
        ? summary.length >= 72 &&
          (summary.match(/[A-Za-z][A-Za-z0-9'-]*/g) ?? []).length >= 10
        : summary.length >= 36 &&
          (summary.match(/[\u3400-\u9fff]/g) ?? []).length >= 18;
    if (substantive) break;
    const detail = trimText(feature, input.locale === "en" ? 170 : 120);
    const comparableSummary = summary.toLocaleLowerCase();
    const comparableDetail = detail.toLocaleLowerCase();
    if (
      comparableSummary.includes(comparableDetail) ||
      comparableDetail.includes(comparableSummary)
    )
      continue;
    summary = trimText(
      `${summary.replace(/[.!?。！？；;：:]$/u, "")}${input.locale === "zh" ? "；" : " — "}${detail}`,
      240,
    );
  }
  return summary;
}

async function translateParts(
  parts: string[],
  from: "en" | "zh",
  to: "en" | "zh",
  cache: ImportCache,
): Promise<string[]> {
  if (!parts.length) return [];
  const input = parts.map((part, index) => `[${index}] ${part}`).join("\n");
  const key = sha256(`${from}\0${to}\0${input}`);
  const cached = cache.translations?.[key];
  let translated = cached;
  if (!translated) {
    const body = new URLSearchParams({
      client: "gtx",
      sl: from === "zh" ? "zh-CN" : "en",
      tl: to === "zh" ? "zh-CN" : "en",
      dt: "t",
      q: input,
    });
    const response = await fetchResponse(
      "https://translate.googleapis.com/translate_a/single",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
      },
    );
    const payload = (await response.json()) as unknown[][][];
    translated = (payload[0] ?? [])
      .map((piece) => String(piece?.[0] ?? ""))
      .join("");
    cache.translations ??= {};
    cache.translations[key] = translated;
    saveCache(cache);
  }
  const matches = [...translated.matchAll(/\[(\d+)]\s*([^\[]+)/g)];
  if (matches.length !== parts.length)
    throw new Error("Translation response did not preserve item markers.");
  const output = new Array<string>(parts.length);
  for (const match of matches) output[Number(match[1])] = match[2]!.trim();
  if (output.some((value) => !value))
    throw new Error("Translation response omitted an item.");
  return output;
}

async function localizeParts(
  parts: string[],
  cache: ImportCache,
): Promise<Record<"en" | "zh", string[]>> {
  const output: Record<"en" | "zh", string[]> = {
    en: new Array<string>(parts.length),
    zh: new Array<string>(parts.length),
  };
  for (const sourceLocale of ["en", "zh"] as const) {
    const indexes = parts
      .map((part, index) => ({ index, locale: inferLanguage(part) }))
      .filter((entry) => entry.locale === sourceLocale)
      .map((entry) => entry.index);
    const sourceParts = indexes.map((index) => parts[index]!);
    const targetLocale = sourceLocale === "en" ? "zh" : "en";
    const translated = await translateParts(
      sourceParts,
      sourceLocale,
      targetLocale,
      cache,
    );
    indexes.forEach((index, position) => {
      output[sourceLocale][index] = sourceParts[position]!;
      output[targetLocale][index] = translated[position]!;
    });
  }
  return output;
}

function categoryFor(candidate: SourceRepository): string {
  const mapping: Record<string, string> = {
    "agent-session": "agent-automation",
    communication: "productivity-collaboration",
    data: "data-research-knowledge",
    development: "developer-tools",
    lifestyle: "life-devices-physical-world",
    "model-mcp": "models",
    operations: "cloud-devops-observability",
    other: "developer-tools",
    research: "data-research-knowledge",
    security: "security",
    ui: "ui-user-experience",
  };
  return mapping[candidate.category ?? "other"] ?? "developer-tools";
}

function buildOverview(input: {
  description: string;
  features: string[];
  installSpec: string;
  locale: "en" | "zh";
  ref: string;
}): string {
  const bullets = input.features
    .slice(0, 5)
    .map((feature) => `- ${trimText(feature, 300)}`)
    .join("\n");
  const command = `dsh plugin --profile web add ${input.installSpec}`;
  if (input.locale === "zh")
    return [
      "## 概述",
      input.description,
      "## 主要能力",
      bullets,
      "## 安装",
      `使用 \`${command}\` 将插件添加到 DSH 默认的 web profile。`,
      "## 使用与风险",
      `本条目依据公开仓库说明与 README（版本证据：\`${input.ref}\`）整理。安装前请阅读原始文档，确认配置、外部服务与平台要求，并审查源码；目录收录不等同于独立安全、兼容性或可运行性认证。`,
    ].join("\n\n");
  return [
    "## Overview",
    input.description,
    "## Core capabilities",
    bullets,
    "## Installation",
    `Add the plugin to DSH's default web profile with \`${command}\`.`,
    "## Usage and risk",
    `This entry is derived from the public repository description and README at evidence ref \`${input.ref}\`. Review the original setup, external-service and platform requirements, and source code before installation; catalog inclusion is not an independent security, compatibility, or runtime certification.`,
  ].join("\n\n");
}

async function prepareCandidate(
  candidate: SourceRepository,
  repository: GraphRepository | undefined,
  cache: ImportCache,
): Promise<PreparedCandidate> {
  try {
    if (!repository)
      return {
        candidate,
        reason: "GitHub repository metadata is no longer public.",
      };
    const install = executableCandidate(candidate)!;
    const sourceSha = candidate.validation?.sourceSha;
    if (!sourceSha)
      return { candidate, reason: "Validated source commit is missing." };
    let readme: { content: string; path: string; url: string } | undefined;
    let manifest: Record<string, unknown>;
    let source: {
      kind: "github" | "npm";
      url: string;
      ref: string;
      etag?: string;
      contentHash?: string;
      availability: "available";
    };
    let installSpec: string;
    if (install.source === "npm") {
      const parsed = npmSpecifier(install.specifier ?? "");
      const selector = parsed.selector ?? "latest";
      const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(parsed.name)}/${encodeURIComponent(selector)}`;
      const response = await fetchResponse(registryUrl);
      if (response.status === 404)
        return {
          candidate,
          reason: "npm package or requested dist-tag is unavailable.",
        };
      manifest = (await response.json()) as Record<string, unknown>;
      const facts = packageFacts(manifest, parsed.name);
      if (!facts || facts.name.toLowerCase() !== parsed.name)
        return {
          candidate,
          reason: "npm manifest identity or version is incomplete.",
        };
      readme = await packageReadme(facts.name, facts.version);
      installSpec = `${facts.name}@${facts.version}`;
      const etag = response.headers.get("etag") ?? undefined;
      source = {
        kind: "npm",
        url: registryUrl,
        ref: facts.version,
        ...(etag ? { etag } : { contentHash: sha256(canonicalJson(manifest)) }),
        availability: "available",
      };
    } else {
      const packageJson = await rawFile(candidate, ["package.json"]);
      if (!packageJson)
        return {
          candidate,
          reason: "Root package.json is unavailable at the validated commit.",
        };
      try {
        manifest = JSON.parse(packageJson.content) as Record<string, unknown>;
      } catch {
        return { candidate, reason: "Root package.json is invalid JSON." };
      }
      if (!packageFacts(manifest))
        return {
          candidate,
          reason: "GitHub package name or version is incomplete.",
        };
      readme = await rawFile(candidate, [
        "README.md",
        "readme.md",
        "Readme.md",
        "README.MD",
        "README.zh-CN.md",
      ]);
      installSpec = `github:${repository.nameWithOwner}#${sourceSha}`;
      source = {
        kind: "github",
        url: repository.url,
        ref: sourceSha,
        contentHash: sha256(
          canonicalJson({
            manifest,
            repository: graphRepositoryFacts(repository),
            sourceSha,
          }),
        ),
        availability: "available",
      };
    }
    const factsPackage = packageFacts(manifest)!;
    const readmeSource =
      readme?.url ??
      (source.kind === "npm"
        ? source.url
        : `https://github.com/${repository.nameWithOwner}`);
    const readmeRef = source.kind === "npm" ? source.ref : sourceSha;
    const readmeHash = readme ? sha256(readme.content) : undefined;
    const directObservation = parsePluginObservation({
      schemaVersion: 1,
      observedAt: new Date().toISOString(),
      identity: operationIdentity(candidate),
      source,
      detection: {
        signals: [
          { kind: "topic", value: "dsh-plugin" },
          ...(readme
            ? [
                {
                  kind: "readme" as const,
                  value: "README mentions DSH plugin use",
                },
              ]
            : []),
        ],
      },
      facts: {
        package: factsPackage,
        repository: graphRepositoryFacts(repository),
        publisher: publisherFacts(repository),
        readme: readme
          ? {
              availability: "available",
              format: "markdown",
              sourceUrl: readme.url,
              sourceRef: readmeRef,
              path: readme.path,
              content: readme.content,
              contentHash: readmeHash,
            }
          : {
              availability: "unavailable",
              format: "markdown",
              sourceUrl: readmeSource,
              sourceRef: readmeRef,
            },
        installTargets: [
          {
            kind: install.source === "npm" ? "npm" : "github",
            spec: installSpec,
            packageName: factsPackage.name,
            version: factsPackage.version,
            primary: true,
            available: true,
          },
        ],
        ...(compatibility(manifest)
          ? { compatibility: compatibility(manifest) }
          : {}),
        metrics: {
          githubStars: repository.stargazerCount,
          githubForks: repository.forkCount,
          githubOpenIssues: repository.issues.totalCount,
        },
      },
    });
    if (!readme || !readmeHash)
      return {
        candidate,
        directObservation,
        reason: "No bounded root README was available for sourced curation.",
      };
    const evidence = readmeEvidence(readme.content);
    const rawDescription = meaningful(candidate.description)
      ? cleanMarkdownLine(candidate.description)
      : meaningful(repository.description ?? undefined)
        ? cleanMarkdownLine(repository.description!)
        : evidence.intro;
    if (!meaningful(rawDescription))
      return {
        candidate,
        directObservation,
        reason: "Public sources do not contain a substantive description.",
      };
    const sourceFeatures = evidence.features.filter(meaningful).slice(0, 5);
    if (!sourceFeatures.length) {
      const clauses = rawDescription
        .split(/[。.!?；;]+/)
        .map(cleanMarkdownLine)
        .filter(capabilityEvidence);
      sourceFeatures.push(...clauses.slice(0, 4));
    }
    if (!sourceFeatures.length)
      return {
        candidate,
        directObservation,
        reason: "Public sources do not contain concrete capability evidence.",
      };
    const translated = await localizeParts(
      [rawDescription, ...sourceFeatures],
      cache,
    );
    const localized = {
      en: { description: translated.en[0]!, features: translated.en.slice(1) },
      zh: { description: translated.zh[0]!, features: translated.zh.slice(1) },
    };
    const directUrls = [
      repository.url,
      readme.url,
      source.url,
      `https://dshmk.com/plugins/${candidate.slug}`,
    ];
    const curation = {
      displayName: {
        en: trimText(candidate.name || factsPackage.name, 120),
        zh: trimText(candidate.name || factsPackage.name, 120),
      },
      shortDescription: {
        en: buildShortDescription({ ...localized.en, locale: "en" }),
        zh: buildShortDescription({ ...localized.zh, locale: "zh" }),
      },
      overviewMarkdown: {
        en: buildOverview({
          ...localized.en,
          installSpec,
          locale: "en",
          ref: source.ref,
        }),
        zh: buildOverview({
          ...localized.zh,
          installSpec,
          locale: "zh",
          ref: source.ref,
        }),
      },
      sourceReadmeHash: readmeHash,
      categories: [categoryFor(candidate)],
      tags: [
        ...new Set(
          (candidate.topics ?? [])
            .map((value) => value.toLowerCase())
            .filter((value) => value.length <= 64),
        ),
      ].slice(0, 30),
      derivedFrom: [...new Set(directUrls)],
    };
    return { candidate, directObservation, curation };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      candidate,
      reason: message.includes("translate.googleapis.com")
        ? "Translation service unavailable."
        : message,
    };
  }
}

function resultRows(envelope: {
  data: unknown;
}): Array<Record<string, unknown>> {
  if (!envelope.data || typeof envelope.data !== "object") return [];
  const results = (envelope.data as { results?: unknown }).results;
  return Array.isArray(results)
    ? results.filter(
        (value): value is Record<string, unknown> =>
          Boolean(value) && typeof value === "object",
      )
    : [];
}

function summarizeStatuses(results: Array<Record<string, unknown>>) {
  const counts: Record<string, number> = {};
  for (const result of results) {
    const status =
      typeof result.status === "string" ? result.status : "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

function observationIdentity(observation: PluginObservationV1): string {
  return observation.identity.kind === "npm"
    ? `npm:${observation.identity.packageName}`
    : `github:${observation.identity.repositoryId}:${observation.identity.subdirectory}`;
}

function isIdentityConflict(result: Record<string, unknown>): boolean {
  const error = result.error;
  return (
    Boolean(error) &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "observation_identity_conflict"
  );
}

async function upsertBatches(
  observations: PluginObservationV1[],
  batchSize: number,
  dryRun: boolean,
) {
  const results: Array<Record<string, unknown>> = [];
  for (const [index, batch] of chunks(observations, batchSize).entries()) {
    const envelope = await retry(
      `observation batch ${index + 1}`,
      () => upsertPlugins(hub, { observations: batch }, dryRun),
      8,
    );
    const batchResults = resultRows(envelope);
    results.push(...batchResults);
    process.stdout.write(
      `Observation batch ${index + 1}/${Math.ceil(observations.length / batchSize)}: ${JSON.stringify(summarizeStatuses(batchResults))}\n`,
    );
    const rejected = batchResults.filter(
      (result) => result.status === "rejected",
    );
    if (rejected.length)
      process.stdout.write(
        `Rejected observations: ${JSON.stringify(rejected)}\n`,
      );
    if (!dryRun) await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return results;
}

async function main(): Promise<void> {
  const cache = loadCache();
  const blockedIdentities = new Set(cache.blockedIdentities ?? []);
  const upstreamResponse = await fetchResponse(upstreamUrl);
  const catalog = (await upstreamResponse.json()) as SourceCatalog;
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.repositories))
    throw new Error("Unexpected public catalog schema.");
  const verified = catalog.repositories.filter(
    (candidate) =>
      candidate.projectType === "plugin" &&
      candidate.archived !== true &&
      candidate.fork !== true &&
      candidate.validation?.eligible === true &&
      candidate.validation.overall === "verified" &&
      Boolean(candidate.validation.sourceSha) &&
      Boolean(executableCandidate(candidate)),
  );
  const currentCatalog = productionCatalog();
  let selected: SourceRepository[];
  if (repairShortSeo || recurate) {
    selected = verified.filter(
      (candidate) =>
        recurate ||
        currentCatalog.shortSeoIdentities.has(identityFor(candidate)),
    );
  } else if (apply && cache.selectedIdentities?.length && !cache.completed) {
    const saved = new Set(cache.selectedIdentities);
    selected = verified.filter((candidate) =>
      saved.has(identityFor(candidate)),
    );
  } else {
    selected = verified.filter(
      (candidate) => !alreadyPresent(candidate, currentCatalog),
    );
    selected.sort(
      (left, right) =>
        (right.stars ?? 0) - (left.stars ?? 0) ||
        left.fullName.localeCompare(right.fullName),
    );
    if (requestedLimit) selected = selected.slice(0, requestedLimit);
    if (apply) {
      cache.generatedAt = catalog.generatedAt;
      cache.selectedIdentities = selected.map(identityFor);
      cache.completed = false;
      saveCache(cache);
    }
  }
  if (requestedIdentities.length) {
    const requested = new Set(requestedIdentities);
    selected = selected.filter((candidate) =>
      requested.has(identityFor(candidate)),
    );
  }
  if (!selected.length) {
    process.stdout.write(
      `${JSON.stringify({ mode: apply ? "apply" : "dry-run", verifiedCandidates: verified.length, selected: 0, message: "No new stable identities." }, null, 2)}\n`,
    );
    return;
  }
  process.stdout.write(
    `Selected ${selected.length} ${repairShortSeo ? "short-SEO" : "missing"} identities from ${verified.length} verified, single-target candidates.\n`,
  );
  const repositories = await graphRepositories(selected);
  const prepared = await mapConcurrent(
    selected,
    concurrency,
    async (candidate, index) => {
      const result = await prepareCandidate(
        candidate,
        repositories.get(candidate.fullName.toLowerCase()),
        cache,
      );
      if ((index + 1) % 25 === 0 || index + 1 === selected.length)
        process.stdout.write(`Prepared ${index + 1}/${selected.length}\n`);
      return result;
    },
  );
  const discovery = selected
    .filter(
      (candidate) =>
        !currentCatalog.importedIdentities.has(identityFor(candidate)),
    )
    .map((candidate) => discoveryObservation(candidate, catalog.generatedAt));
  const directPrepared = prepared.flatMap((item) =>
    item.directObservation ? [item.directObservation] : [],
  );
  const direct = directPrepared.filter((observation) => {
    const identity = observationIdentity(observation);
    return (
      (!currentCatalog.directIdentities.has(identity) || recurate) &&
      !blockedIdentities.has(identity)
    );
  });
  const curatablePrepared = prepared.filter(
    (
      item,
    ): item is PreparedCandidate & {
      directObservation: PluginObservationV1;
      curation: NonNullable<PreparedCandidate["curation"]>;
    } => Boolean(item.directObservation && item.curation),
  );
  const pendingCurationCandidates = curatablePrepared.filter(
    (item) =>
      !currentCatalog.publishedIdentities.has(identityFor(item.candidate)) ||
      recurate ||
      (repairShortSeo &&
        currentCatalog.shortSeoIdentities.has(identityFor(item.candidate))),
  );
  const validation = {
    upstreamGeneratedAt: catalog.generatedAt,
    verifiedCandidates: verified.length,
    selected: selected.length,
    discoveryObservations: selected.length,
    pendingDiscoveryObservations: discovery.length,
    directObservations: directPrepared.length,
    pendingDirectObservations: direct.length,
    knownIdentityConflicts: blockedIdentities.size,
    curatable: curatablePrepared.length,
    pendingCurations: pendingCurationCandidates.length,
    retainedAsDraft: selected.length - curatablePrepared.length,
    preparationReasons: Object.fromEntries(
      Object.entries(
        Object.groupBy(
          prepared.filter((item) => !item.curation),
          (item) => item.reason ?? "unknown",
        ),
      )
        .map(([reason, items]) => [reason, items.length])
        .sort((left, right) => right[1] - left[1])
        .slice(0, 12),
    ),
    samples: curatablePrepared.slice(0, 5).map((item) => ({
      identity: identityFor(item.candidate),
      description: item.curation.shortDescription,
      install: executableCandidate(item.candidate)?.specifier,
    })),
  };
  if (!apply) {
    const dryDiscovery = await upsertBatches(discovery, 100, true);
    const dryDirect = direct.length
      ? await upsertBatches(direct, 10, true)
      : [];
    process.stdout.write(
      `${JSON.stringify({ mode: "dry-run", validation, dryRunResults: { discovery: summarizeStatuses(dryDiscovery), direct: summarizeStatuses(dryDirect) } }, null, 2)}\n`,
    );
    return;
  }
  const bookmark = productionBookmark();
  const discoveryResults = await upsertBatches(discovery, 20, false);
  const directResults = direct.length
    ? await upsertBatches(direct, 10, false)
    : [];
  for (const result of directResults) {
    if (isIdentityConflict(result) && typeof result.identity === "string")
      blockedIdentities.add(result.identity);
  }
  cache.blockedIdentities = [...blockedIdentities].sort();
  saveCache(cache);
  const afterDirectCatalog = productionCatalog();
  const publishableIdentities = new Set<string>();
  const curatableByPlugin = new Map<
    string,
    (typeof curatablePrepared)[number]
  >();
  for (const item of curatablePrepared) {
    const identity = identityFor(item.candidate);
    if (!afterDirectCatalog.directIdentities.has(identity)) continue;
    const pluginId = afterDirectCatalog.pluginIds.get(identity);
    if (!pluginId) continue;
    publishableIdentities.add(identity);
    if (
      (!afterDirectCatalog.publishedIdentities.has(identity) ||
        recurate ||
        (repairShortSeo &&
          afterDirectCatalog.shortSeoIdentities.has(identity))) &&
      !curatableByPlugin.has(pluginId)
    )
      curatableByPlugin.set(pluginId, item);
  }
  const curatable = [...curatableByPlugin.entries()].map(
    ([pluginId, item]) => ({ pluginId, item }),
  );
  const curationResults = await mapConcurrent(
    curatable,
    Math.min(concurrency, 6),
    async ({ pluginId, item }, index) => {
      const identity = identityFor(item.candidate);
      try {
        let curated: Awaited<ReturnType<typeof curatePlugin>> | undefined;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          const current = await retry(
            `curation state ${identity}`,
            () => getPlugin(hub, pluginId),
            8,
          );
          const state = current.data as { revision?: number };
          try {
            curated = await retry(
              `curation ${identity}`,
              () => curatePlugin(hub, pluginId, item.curation, state.revision),
              8,
            );
            break;
          } catch (error) {
            const code =
              error &&
              typeof error === "object" &&
              "issue" in error &&
              (error as { issue?: { code?: unknown } }).issue?.code;
            if (code !== "revision_conflict" || attempt === 2) throw error;
          }
        }
        if (!curated) throw new Error("Curation did not return a result.");
        const verifiedPlugin = await retry(
          `curation verification ${identity}`,
          () => getPlugin(hub, pluginId),
          8,
        );
        const verification = verifiedPlugin.data as {
          needs?: string[];
          state?: string;
        };
        if (
          verification.state !== "published" ||
          (verification.needs?.length ?? 0) > 0
        )
          return {
            identity,
            status: "incomplete",
            needs: verification.needs ?? [],
            state: verification.state,
          };
        if ((index + 1) % 20 === 0 || index + 1 === curatable.length)
          process.stdout.write(`Curated ${index + 1}/${curatable.length}\n`);
        return {
          identity,
          status: (curated.data as { status?: string }).status ?? "updated",
        };
      } catch (error) {
        return {
          identity,
          status: "rejected",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
  const rejectedObservations = [...discoveryResults, ...directResults].filter(
    (result) => result.status === "rejected",
  ).length;
  const incomplete = curationResults.filter(
    (result) => result.status === "incomplete",
  ).length;
  const rejectedCurations = curationResults.filter(
    (result) => result.status === "rejected",
  ).length;
  const unsuccessfulCurations = curationResults.filter(
    (result) => result.status === "incomplete" || result.status === "rejected",
  );
  if (unsuccessfulCurations.length)
    process.stdout.write(
      `Unsuccessful curations: ${JSON.stringify(unsuccessfulCurations)}\n`,
    );
  const finalCatalog = productionCatalog();
  const selectedIdentities = selected.map(identityFor);
  const imported = selectedIdentities.filter((identity) =>
    finalCatalog.importedIdentities.has(identity),
  ).length;
  const directComplete = selectedIdentities.filter((identity) =>
    finalCatalog.directIdentities.has(identity),
  ).length;
  const directPreparedIdentities = new Set(
    directPrepared.map(observationIdentity),
  );
  const blockedDirect = [...directPreparedIdentities].filter(
    (identity) =>
      blockedIdentities.has(identity) &&
      !finalCatalog.directIdentities.has(identity),
  ).length;
  const directSatisfied = [...directPreparedIdentities].filter(
    (identity) =>
      finalCatalog.directIdentities.has(identity) ||
      blockedIdentities.has(identity),
  ).length;
  const publishedIdentities = selectedIdentities.filter((identity) =>
    finalCatalog.publishedIdentities.has(identity),
  );
  const remainingShortSeo = selectedIdentities.filter((identity) =>
    finalCatalog.shortSeoIdentities.has(identity),
  ).length;
  const publishedPluginIds = new Set(
    publishedIdentities.flatMap((identity) => {
      const pluginId = finalCatalog.pluginIds.get(identity);
      return pluginId ? [pluginId] : [];
    }),
  );
  const outcome =
    imported !== selected.length ||
    directSatisfied < directPreparedIdentities.size ||
    (recurate && curatablePrepared.length !== selected.length) ||
    (repairShortSeo && remainingShortSeo > 0) ||
    publishedPluginIds.size <
      new Set(
        [...publishableIdentities].flatMap((identity) => {
          const pluginId = finalCatalog.pluginIds.get(identity);
          return pluginId ? [pluginId] : [];
        }),
      ).size
      ? ("partial" as const)
      : ("completed" as const);
  const completedAt = new Date();
  const report = {
    schemaVersion: 1,
    runId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    outcome,
    body: repairShortSeo
      ? {
          en: `Completed evidence-based SEO enrichment for ${selected.length} published plugins with unusually short search descriptions. Public README capability details were folded into the bilingual summaries, SEO metadata was regenerated, and default web-profile installation guidance was preserved. Remaining short SEO descriptions: ${remainingShortSeo}; incomplete or rejected curations: ${incomplete + rejectedCurations}.`,
          zh: `已完成 ${selected.length} 个已发布插件的短 SEO 描述增补。双语摘要依据公开 README 的具体能力补充信息并重新生成 SEO 元数据，同时保留默认 web profile 安装说明。仍偏短的 SEO 描述 ${remainingShortSeo} 条，内容未完成或拒绝 ${incomplete + rejectedCurations} 条。`,
        }
      : recurate
        ? {
            en: `Completed targeted content-quality repair for ${selected.length} published plugins. Procedural setup fragments were excluded from capability summaries, incomplete source fragments were discarded, and bilingual SEO metadata was regenerated from substantive public README evidence. Incomplete or rejected curations: ${incomplete + rejectedCurations}.`,
            zh: `已完成 ${selected.length} 个已发布插件的定向内容质量修复。能力摘要已排除安装步骤等操作性片段，丢弃不完整来源句，并依据公开 README 的实质信息重新生成双语 SEO 元数据。内容未完成或拒绝 ${incomplete + rejectedCurations} 条。`,
          }
        : {
            en: `Completed a one-time public catalog intake across ${selected.length} newly discovered stable plugin identities. ${imported} source leads were recorded with deduplication and provenance; ${directComplete} entries now have direct repository or package facts, exact installation targets, publisher data, and saved README evidence. ${blockedDirect} package-identity conflicts remain quarantined as drafts without overwriting canonical records. ${publishedPluginIds.size} plugins passed the substantive bilingual content gate and are published with default web-profile installation guidance; ${selected.length - publishedIdentities.length} identities remain drafts instead of exposing placeholder copy. Incomplete or rejected curations: ${incomplete + rejectedCurations}.`,
            zh: `已完成一次性公开目录增补，共处理 ${selected.length} 个新发现的稳定插件身份。经身份去重与来源留痕，已记录 ${imported} 条发现数据；其中 ${directComplete} 条已补齐仓库或包事实、精确安装目标、发布者资料与原始 README 证据。${blockedDirect} 条包身份冲突已隔离为草稿，未覆盖现有正式记录。${publishedPluginIds.size} 个插件通过实质性双语内容门槛并发布，安装说明统一使用默认 web profile；其余 ${selected.length - publishedIdentities.length} 个身份保留为草稿，避免占位内容进入前台。内容未完成或拒绝 ${incomplete + rejectedCurations} 条。`,
          },
  };
  await retry("maintenance report", () => publishReport(hub, report), 8);
  if (!requestedIdentities.length && !repairShortSeo && !recurate)
    cache.completed = outcome === "completed";
  saveCache(cache);
  process.stdout.write(
    `${JSON.stringify({ mode: "applied", runId, bookmark, outcome, validation, results: { discovery: summarizeStatuses(discoveryResults), direct: summarizeStatuses(directResults), curation: summarizeStatuses(curationResults as Array<Record<string, unknown>>), imported, directComplete, blockedDirect, remainingShortSeo, published: publishedPluginIds.size, retainedAsDraft: selected.length - publishedIdentities.length } }, null, 2)}\n`,
  );
}

await main();
