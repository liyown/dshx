import { createHash } from "node:crypto";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { c as createTar } from "tar";
import { afterEach, describe, expect, it } from "vitest";

import { verifyEvidenceManifest, verifyIntegrity } from "../src/validate.js";

const temporary: string[] = [];

async function archiveFixture(options: {
  kind?: "npm-tgz" | "git-tgz";
  patch?: string;
  subdirectory?: string;
  symlink?: boolean;
}) {
  const root = await mkdtemp(join(tmpdir(), "dshx-cli-test-"));
  temporary.push(root);
  const kind = options.kind ?? "npm-tgz";
  const archiveRoot = kind === "npm-tgz" ? "package" : "";
  const packageRoot = join(root, archiveRoot, options.subdirectory ?? "");
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name: "@fixture/plugin",
      version: "1.0.0",
      dsh: { bundle: { patch: "dsh.patch.json" } },
      dependencies: { "@becomeopc/dshx": "1.0.0" },
      scripts: { postinstall: `touch ${join(root, "executed")}` },
    }),
  );
  await writeFile(join(packageRoot, "dsh.patch.json"), options.patch ?? "[]");
  if (options.symlink)
    await symlink("/etc/passwd", join(packageRoot, "unsafe-link"));
  const archive = join(root, "plugin.tgz");
  const entries =
    kind === "npm-tgz" ? ["package"] : ["package.json", "dsh.patch.json"];
  if (options.symlink)
    entries.push(kind === "npm-tgz" ? "package/unsafe-link" : "unsafe-link");
  await createTar({ gzip: true, cwd: root, file: archive }, entries);
  const bytes = await readFile(archive);
  const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { root, archive, integrity, sha256, kind, archiveRoot };
}

function evidence(
  fixture: Awaited<ReturnType<typeof archiveFixture>>,
  overrides: Record<string, unknown> = {},
) {
  const base = {
    schemaVersion: 1,
    identity: { kind: "npm", packageName: "@fixture/plugin" },
    repository: { archived: false, disabled: false },
    artifact: {
      path: fixture.archive,
      kind: fixture.kind,
      integrity: fixture.kind === "npm-tgz" ? fixture.integrity : null,
      stableTag: fixture.kind === "git-tgz" ? "v1.0.0" : null,
      archiveRoot: fixture.archiveRoot,
    },
    package: { subdirectory: "" },
    sources: [
      {
        kind: "package-archive",
        purpose: "verification",
        url: "https://example.test/plugin.tgz",
        observedAt: new Date().toISOString(),
        sha256: fixture.sha256,
        ref: "1.0.0",
      },
    ],
  };
  return { ...base, ...overrides };
}

afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("local deterministic catalog verification", () => {
  it("verifies an npm tarball and never executes lifecycle scripts", async () => {
    const fixture = await archiveFixture({});
    const result = await verifyEvidenceManifest(evidence(fixture));
    expect(result).toMatchObject({
      qualified: true,
      identityKey: "npm:@fixture/plugin",
      attestation: {
        checkerVersion: "3",
        packageName: "@fixture/plugin",
        packageVersion: "1.0.0",
        patchPath: "dsh.patch.json",
        dshxDetected: true,
      },
    });
    await expect(access(join(fixture.root, "executed"))).rejects.toThrow();
  });

  it("rejects a patch that is not a top-level array", async () => {
    const fixture = await archiveFixture({ patch: "{ invalid: true }" });
    const result = await verifyEvidenceManifest(evidence(fixture));
    expect(result.qualified).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ code: "patch.array", status: "fail" }),
    );
  });

  it("rejects symlinks and other unsafe archive entry types before extraction", async () => {
    const fixture = await archiveFixture({ symlink: true });
    const result = await verifyEvidenceManifest(evidence(fixture));
    expect(result.qualified).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ code: "artifact.safe_paths", status: "fail" }),
    );
  });

  it("requires Git-only artifacts to be root packages with a stable tag", async () => {
    const fixture = await archiveFixture({ kind: "git-tgz" });
    const valid = evidence(fixture, {
      identity: { kind: "github", repositoryId: "123", subdirectory: "" },
    });
    expect((await verifyEvidenceManifest(valid)).qualified).toBe(true);
    const invalid = structuredClone(valid);
    invalid.artifact.stableTag = "next";
    expect((await verifyEvidenceManifest(invalid)).qualified).toBe(false);
  });

  it("compares registry integrity against the exact local bytes", () => {
    const bytes = Buffer.from("fixture");
    const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    expect(verifyIntegrity(bytes, integrity)).toBe(true);
    expect(verifyIntegrity(Buffer.from("changed"), integrity)).toBe(false);
  });

  it("rejects a local archive that differs from the preserved source hash", async () => {
    const fixture = await archiveFixture({});
    const input = evidence(fixture);
    input.sources[0]!.sha256 = "f".repeat(64);
    const result = await verifyEvidenceManifest(input);
    expect(result.qualified).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        code: "artifact.source_sha256",
        status: "fail",
      }),
    );
  });
});
