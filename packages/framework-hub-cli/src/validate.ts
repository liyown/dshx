import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, resolve } from "node:path";

import { t as listTar, x as extractTar } from "tar";
import { isSeq, parseDocument } from "yaml";

import {
  evidenceManifestV1Schema,
  identityKeyFor,
  verificationAttestationV1Schema,
  type EvidenceManifestV1,
  type VerificationAttestationV1,
} from "./catalog-schema.js";

const checkerVersion = "3";
const maxArchiveBytes = 50 * 1024 * 1024;
const maxExpandedBytes = 100 * 1024 * 1024;
const maxEntries = 20_000;

export type Check = {
  code: string;
  status: "pass" | "fail" | "warn";
  message: string;
  observed?: Record<string, unknown> | null;
  evidenceUrl?: string | null;
  evidenceSha?: string | null;
};

function hash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function patchPath(manifest: Record<string, unknown>): string | null {
  const dsh = manifest["dsh"];
  if (!dsh || typeof dsh !== "object") return null;
  const bundle = (dsh as Record<string, unknown>)["bundle"];
  if (!bundle || typeof bundle !== "object") return null;
  const value = (bundle as Record<string, unknown>)["patch"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isArrayPatch(source: string): boolean {
  try {
    const document = parseDocument(source);
    return document.errors.length === 0 && isSeq(document.contents);
  } catch {
    return false;
  }
}

export function verifyIntegrity(buffer: Buffer, integrity: string): boolean {
  const [algorithm, expected] = integrity.split("-", 2);
  if (
    !algorithm ||
    !expected ||
    !["sha512", "sha384", "sha256", "sha1"].includes(algorithm)
  )
    return false;
  return createHash(algorithm).update(buffer).digest("base64") === expected;
}

function safeArchivePath(value: string): boolean {
  if (
    !value ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.split("/").includes("..")
  )
    return false;
  const normalized = posix.normalize(value);
  return (
    normalized !== ".." &&
    !normalized.startsWith("../") &&
    !/^[a-zA-Z]:/.test(normalized)
  );
}

async function inspectArchive(path: string) {
  let entries = 0;
  let expandedBytes = 0;
  const unsafe: string[] = [];
  await listTar({
    file: path,
    strict: true,
    onentry: (entry) => {
      entries += 1;
      expandedBytes += entry.size ?? 0;
      const allowedType = [
        "File",
        "OldFile",
        "ContiguousFile",
        "Directory",
      ].includes(entry.type);
      if (!safeArchivePath(entry.path) || !allowedType) unsafe.push(entry.path);
      entry.resume();
    },
  });
  return {
    entries,
    expandedBytes,
    unsafe: unsafe.slice(0, 20),
    safe:
      entries <= maxEntries &&
      expandedBytes <= maxExpandedBytes &&
      unsafe.length === 0,
  };
}

function detectsDshx(manifest: Record<string, unknown>): boolean {
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const dependencies = manifest[field];
    if (
      dependencies &&
      typeof dependencies === "object" &&
      Object.keys(dependencies).some((name) =>
        name.toLowerCase().includes("dshx"),
      )
    )
      return true;
  }
  return "dshx" in manifest;
}

function check(
  checks: Check[],
  code: string,
  pass: boolean,
  passMessage: string,
  failMessage: string,
  evidence?: {
    url?: string | null;
    sha?: string | null;
    observed?: Record<string, unknown>;
  },
) {
  checks.push({
    code,
    status: pass ? "pass" : "fail",
    message: pass ? passMessage : failMessage,
    ...(evidence?.url === undefined ? {} : { evidenceUrl: evidence.url }),
    ...(evidence?.sha === undefined ? {} : { evidenceSha: evidence.sha }),
    ...(evidence?.observed === undefined
      ? {}
      : { observed: evidence.observed }),
  });
}

export async function verifyEvidenceManifest(raw: unknown): Promise<{
  qualified: boolean;
  identityKey: string;
  checks: Check[];
  attestation?: VerificationAttestationV1;
}> {
  const input = evidenceManifestV1Schema.parse(raw);
  const checks: Check[] = [];
  const identityKey = identityKeyFor(input.identity);
  const artifactPath = resolve(input.artifact.path);
  const artifactStat = await stat(artifactPath).catch(() => null);
  check(
    checks,
    "artifact.size",
    Boolean(
      artifactStat?.isFile() &&
      artifactStat.size > 0 &&
      artifactStat.size <= maxArchiveBytes,
    ),
    "artifact size is within the safe limit",
    "artifact must be a non-empty file no larger than 50 MiB",
    { observed: { path: artifactPath, bytes: artifactStat?.size ?? null } },
  );
  if (checks.at(-1)?.status === "fail")
    return { qualified: false, identityKey, checks };
  const artifact = await readFile(artifactPath);
  const artifactSha256 = hash(artifact);
  const artifactEvidence = input.sources.find(
    (source) =>
      source.purpose === "verification" && typeof source.sha256 === "string",
  );
  check(
    checks,
    "artifact.source_sha256",
    artifactEvidence?.sha256 === artifactSha256,
    "local artifact matches the preserved verification source hash",
    "local artifact does not match the preserved verification source hash",
    artifactEvidence
      ? {
          url: artifactEvidence.url,
          sha: artifactEvidence.sha256 ?? null,
          observed: { artifactSha256 },
        }
      : { observed: { artifactSha256 } },
  );
  const archive = await inspectArchive(artifactPath).catch(() => null);
  check(
    checks,
    "artifact.safe_paths",
    archive?.safe === true,
    "archive paths, types, entry count, and expanded size are safe",
    "archive is unreadable, contains unsafe paths or types, or exceeds expansion limits",
    { observed: archive ?? { unreadable: true } },
  );
  check(
    checks,
    "repository.available",
    !input.repository.archived && !input.repository.disabled,
    "repository is reported available by the supplied evidence",
    "repository is archived or disabled",
  );

  if (input.artifact.kind === "npm-tgz")
    check(
      checks,
      "npm.integrity",
      Boolean(input.artifact.integrity) &&
        verifyIntegrity(artifact, input.artifact.integrity ?? ""),
      "npm tarball matches registry integrity",
      "npm tarball integrity is missing or does not match",
    );
  else {
    check(
      checks,
      "git.root",
      input.package.subdirectory === "",
      "Git-only plugin is at repository root",
      "Git-only plugins must be at repository root",
    );
    check(
      checks,
      "git.stable_tag",
      /^v?\d+\.\d+\.\d+$/.test(input.artifact.stableTag ?? ""),
      "Git archive has a stable semantic version tag",
      "Git-only plugins require a stable semantic version tag",
    );
  }
  check(
    checks,
    "monorepo.npm",
    input.package.subdirectory === "" || input.artifact.kind === "npm-tgz",
    "package location has a publishable install target",
    "monorepo subdirectories must use a published npm artifact",
  );

  if (!archive?.safe) return { qualified: false, identityKey, checks };

  const directory = await mkdtemp(join(tmpdir(), "dshx-hub-verify-"));
  try {
    await extractTar({
      file: artifactPath,
      cwd: directory,
      strict: true,
      preservePaths: false,
      filter: (entryPath, entry) =>
        safeArchivePath(entryPath) &&
        "type" in entry &&
        ["File", "OldFile", "ContiguousFile", "Directory"].includes(entry.type),
    });
    const archiveRoot =
      input.artifact.archiveRoot ||
      (input.artifact.kind === "npm-tgz" ? "package" : "");
    const packageRoot = posix.join(archiveRoot, input.package.subdirectory);
    if (!safeArchivePath(posix.join(packageRoot || ".", "package.json")))
      throw new Error("package path is unsafe");
    const packageJsonFile = join(directory, packageRoot, "package.json");
    let packageJsonBuffer: Buffer;
    let manifest: Record<string, unknown> = {};
    try {
      packageJsonBuffer = await readFile(packageJsonFile);
      manifest = JSON.parse(packageJsonBuffer.toString("utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      packageJsonBuffer = Buffer.alloc(0);
    }
    const packageName =
      typeof manifest["name"] === "string" ? manifest["name"] : "";
    const packageVersion =
      typeof manifest["version"] === "string" ? manifest["version"] : "";
    check(
      checks,
      "manifest.package_json",
      Boolean(packageJsonBuffer.length && packageName && packageVersion),
      "package.json has a package name and version",
      "package.json is missing, invalid, or lacks name/version",
    );
    if (input.identity.kind === "npm")
      check(
        checks,
        "identity.npm",
        packageName === input.identity.packageName,
        "npm identity matches package.json",
        "npm identity does not match package.json name",
      );
    const patch = patchPath(manifest);
    check(
      checks,
      "manifest.dsh_bundle_patch",
      Boolean(patch),
      `package.json declares ${patch ?? ""}`,
      "package.json does not declare dsh.bundle.patch",
    );
    const relativePatch = patch ? posix.join(packageRoot, patch) : "";
    const safePatch = Boolean(patch && safeArchivePath(relativePatch));
    check(
      checks,
      "patch.safe_path",
      safePatch,
      "patch path remains inside the package root",
      "patch path is absolute or escapes the package root",
    );
    let patchBuffer = Buffer.alloc(0);
    if (safePatch) {
      try {
        patchBuffer = await readFile(join(directory, relativePatch));
      } catch {
        patchBuffer = Buffer.alloc(0);
      }
    }
    check(
      checks,
      "patch.exists",
      patchBuffer.length > 0,
      "declared patch exists in the supplied artifact",
      "declared patch is missing from the supplied artifact",
    );
    check(
      checks,
      "patch.array",
      patchBuffer.length > 0 && isArrayPatch(patchBuffer.toString("utf8")),
      "patch parses as a top-level array",
      "patch must be valid JSON or YAML with a top-level array",
    );

    const qualified = checks.every((entry) => entry.status !== "fail");
    if (!qualified || !patch || !packageName || !packageVersion)
      return { qualified: false, identityKey, checks };
    const attestation = verificationAttestationV1Schema.parse({
      schemaVersion: 1,
      checkerVersion,
      checkedAt: new Date().toISOString(),
      identityKey,
      artifactSha256,
      packageJsonSha256: hash(packageJsonBuffer),
      patchSha256: hash(patchBuffer),
      packageName,
      packageVersion,
      patchPath: patch,
      dshxDetected: detectsDshx(manifest),
      qualified: true,
      checks: checks.map((entry) => ({
        ...entry,
        evidenceUrl: entry.evidenceUrl ?? artifactEvidence?.url ?? null,
        evidenceSha:
          entry.evidenceSha ?? artifactEvidence?.sha256 ?? artifactSha256,
      })),
    });
    return { qualified: true, identityKey, checks, attestation };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
