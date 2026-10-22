/**
 * The single definition of what makes a plugin install target usable.
 *
 * This module deliberately imports nothing: the ingest contract, the
 * publication gate, the public selector and the readiness projection each
 * translate their own shape into these inputs. Four callers, one rule.
 */

export type InstallTargetKind = "npm" | "github";

export type InstallTargetInput = {
  kind: string;
  spec: string;
  packageName?: string | null;
  version?: string | null;
  packagePath?: string | null;
  primary?: boolean;
  available?: boolean;
};

export type ParsedInstallSpec =
  | { kind: "npm"; name: string; version: string | null }
  | { kind: "github"; fullName: string; ref: string };

export type InstallTargetRejection =
  | "unsafe-character"
  | "spec-shape"
  | "unsafe-ref"
  | "unsupported-kind"
  | "kind-mismatch"
  | "package-mismatch"
  | "version-mismatch"
  | "repository-mismatch"
  | "missing-primary"
  | "ambiguous-primary"
  /** Observation-level: the same kind/spec/packagePath appears twice. */
  | "duplicate-target";

export type InstallTargetVerdict =
  | { ok: true; kind: InstallTargetKind; spec: string }
  | { ok: false; reason: InstallTargetRejection };

export type PrimaryTargetVerdict =
  | { ok: true; kind: InstallTargetKind; spec: string; index: number }
  | { ok: false; reason: InstallTargetRejection };

export type InstallTargetExpectation = {
  packageName?: string | null | undefined;
  repositoryFullName?: string | null | undefined;
};

export type InstallTargetContext = {
  packageName: string;
  version: string;
  repositoryFullName: string | null;
};

const npmNamePattern = /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/u;
const npmVersionPattern = /^[^@\s/]+$/u;
const githubSegmentPattern = /^[A-Za-z0-9._-]+$/u;

/** Control characters and whitespace never belong in a shell argument. */
export function hasUnsafeSpecCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 32 || code === 127;
  });
}

/**
 * A git ref that is safe to append to `github:owner/repo#`. The first
 * character may not be `-`, which is why callers no longer need a separate
 * "leading dash" check.
 */
export function isSafeGitRef(value: string): boolean {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value)) return false;
  if (value === "@" || value.includes("..") || value.includes("//") || value.includes("@{"))
    return false;
  if (value.endsWith("/") || value.endsWith(".")) return false;
  return value.split("/").every((part) => !part.startsWith(".") && !part.endsWith(".lock"));
}

function isGithubSegment(value: string): boolean {
  return (
    githubSegmentPattern.test(value) && value !== "." && value !== ".." && !value.startsWith("-")
  );
}

/**
 * Accepts either `owner/repo` or a GitHub URL and returns the canonical
 * lowercase `owner/repo`. GitHub names are case-insensitive; comparing them
 * exactly is what made the public selector reject targets the database had
 * already accepted.
 */
export function normalizeGithubFullName(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let path = trimmed;
  if (/^[a-z]+:\/\//iu.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
      path = url.pathname;
    } catch {
      return null;
    }
  }

  const segments = path
    .replace(/\.git$/u, "")
    .split("/")
    .filter(Boolean);
  if (segments.length !== 2) return null;
  const [owner, repository] = segments;
  if (!owner || !repository || !isGithubSegment(owner) || !isGithubSegment(repository)) return null;
  return `${owner}/${repository}`.toLowerCase();
}

type ParsedInstallSpecResult =
  | { ok: true; parsed: ParsedInstallSpec }
  | { ok: false; reason: "unsafe-character" | "spec-shape" | "unsafe-ref" };

/**
 * Parses the two spec shapes the catalog accepts:
 *
 * - `name` / `name@version` / `@scope/name@version`
 * - `github:owner/repo#ref`
 *
 * `null` from an adapter means "not a spec at all"; the reason distinguishes a
 * malformed shape from a dangerous ref so callers can report it precisely.
 */
export function parseInstallSpec(spec: string): ParsedInstallSpecResult {
  if (hasUnsafeSpecCharacter(spec)) return { ok: false, reason: "unsafe-character" };

  if (/^github:/iu.test(spec)) {
    const rest = spec.slice("github:".length);
    const hash = rest.indexOf("#");
    if (hash <= 0) return { ok: false, reason: "spec-shape" };
    const fullName = normalizeGithubFullName(rest.slice(0, hash));
    if (!fullName) return { ok: false, reason: "spec-shape" };
    const ref = rest.slice(hash + 1);
    if (!isSafeGitRef(ref)) return { ok: false, reason: "unsafe-ref" };
    return { ok: true, parsed: { kind: "github", fullName, ref } };
  }

  const at = spec.lastIndexOf("@");
  const name = at > 0 ? spec.slice(0, at) : spec;
  const version = at > 0 ? spec.slice(at + 1) : null;
  if (at > 0 && !version) return { ok: false, reason: "spec-shape" };
  if (!npmNamePattern.test(name)) return { ok: false, reason: "spec-shape" };
  if (version !== null && !npmVersionPattern.test(version))
    return { ok: false, reason: "spec-shape" };
  return { ok: true, parsed: { kind: "npm", name, version } };
}

/**
 * Shape and safety only — used for every target an observation declares,
 * including non-primary alternatives that will never be rendered.
 */
export function assessTargetSpec(
  target: InstallTargetInput,
  expectation: InstallTargetExpectation = {},
): InstallTargetVerdict {
  if (target.kind !== "npm" && target.kind !== "github")
    return { ok: false, reason: "unsupported-kind" };

  const parsed = parseInstallSpec(target.spec);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  if (parsed.parsed.kind !== target.kind) return { ok: false, reason: "kind-mismatch" };

  if (
    target.packageName &&
    expectation.packageName &&
    target.packageName !== expectation.packageName
  )
    return { ok: false, reason: "package-mismatch" };

  if (parsed.parsed.kind === "npm") {
    const expectedName = expectation.packageName ?? target.packageName ?? null;
    if (expectedName && parsed.parsed.name !== expectedName)
      return { ok: false, reason: "package-mismatch" };
  } else if (expectation.repositoryFullName) {
    const expected = normalizeGithubFullName(expectation.repositoryFullName);
    if (!expected || parsed.parsed.fullName !== expected)
      return { ok: false, reason: "repository-mismatch" };
  }

  return { ok: true, kind: parsed.parsed.kind, spec: target.spec };
}

/**
 * The one target that will be rendered: exactly one available primary, showing
 * the plugin's current package and version.
 */
export function assessPrimaryTargets(
  targets: readonly InstallTargetInput[],
  context: InstallTargetContext,
): PrimaryTargetVerdict {
  const available = targets
    .map((target, index) => ({ target, index }))
    .filter(({ target }) => target.primary === true && target.available !== false);

  if (available.length === 0) return { ok: false, reason: "missing-primary" };
  if (available.length > 1) return { ok: false, reason: "ambiguous-primary" };

  const { target, index } = available[0]!;
  const verdict = assessTargetSpec(target, {
    packageName: context.packageName,
    repositoryFullName: context.repositoryFullName,
  });
  if (!verdict.ok) return verdict;

  if (verdict.kind === "npm") {
    if ((target.packageName ?? context.packageName) !== context.packageName)
      return { ok: false, reason: "package-mismatch" };
    if ((target.version ?? context.version) !== context.version)
      return { ok: false, reason: "version-mismatch" };
    if (target.spec !== `${context.packageName}@${context.version}`)
      return { ok: false, reason: "version-mismatch" };
  } else if (!normalizeGithubFullName(context.repositoryFullName)) {
    return { ok: false, reason: "repository-mismatch" };
  }

  return { ok: true, kind: verdict.kind, spec: verdict.spec, index };
}

export type ObservationTargetIssue = {
  index: number;
  reason: InstallTargetRejection;
};

/** Observation-level rules: uniqueness, a single primary, and spec safety. */
export function assessObservationTargets(
  targets: readonly InstallTargetInput[],
  expectation: InstallTargetExpectation = {},
): ObservationTargetIssue[] {
  const issues: ObservationTargetIssue[] = [];
  const seen = new Set<string>();
  let primaries = 0;

  targets.forEach((target, index) => {
    const key = `${target.kind}\u0000${target.spec}\u0000${target.packagePath ?? ""}`;
    if (seen.has(key)) issues.push({ index, reason: "duplicate-target" });
    else seen.add(key);
    if (target.primary === true) primaries += 1;

    const verdict = assessTargetSpec(target, expectation);
    if (!verdict.ok) issues.push({ index, reason: verdict.reason });
  });

  // `index: -1` marks a rule that belongs to the list rather than one target.
  if (primaries > 1) issues.push({ index: -1, reason: "ambiguous-primary" });
  return issues;
}
