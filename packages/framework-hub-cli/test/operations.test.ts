import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateCatalogPage } from "../src/catalog.js";
import { calculateContentSourceHash } from "../src/catalog-schema.js";
import { helpText } from "../src/help.js";
import { checkMedia } from "../src/media.js";

const temporary: string[] = [];

function proposal() {
  const observedAt = new Date().toISOString();
  const sources = [
    {
      kind: "readme",
      purpose: "content" as const,
      url: "https://github.com/fixture/plugin/blob/main/README.md",
      observedAt,
      sha256: "a".repeat(64),
      ref: "main",
    },
    {
      kind: "npm-tarball",
      purpose: "verification" as const,
      url: "https://registry.npmjs.org/@fixture/plugin/-/plugin-1.0.0.tgz",
      observedAt,
      sha256: "b".repeat(64),
      ref: "1.0.0",
    },
  ];
  const contentSourceHash = calculateContentSourceHash(sources);
  const checks = [
    {
      code: "patch.array",
      status: "pass" as const,
      message: "patch is an array",
      evidenceUrl: sources[1]!.url,
      evidenceSha: "b".repeat(64),
    },
  ];
  const localization = (locale: "en" | "zh") => ({
    locale,
    displayName: locale === "en" ? "Fixture Plugin" : "测试插件",
    shortDescription:
      locale === "en"
        ? "A verified plugin fixture with deterministic evidence."
        : "一个具有确定性证据和完整双语内容的测试插件。",
    overviewMarkdown:
      locale === "en"
        ? "This verified plugin fixture demonstrates a complete catalog proposal assembled by an external Agent."
        : "这个经过验证的测试插件展示了由外部 Agent 整理、并通过本地确定性验证的完整目录提案。",
    highlights:
      locale === "en"
        ? ["Verified archive", "Sourced facts"]
        : ["已验证归档", "事实有来源"],
    installNotesMarkdown: null,
    seoTitle: locale === "en" ? "Fixture Plugin for DSHX" : "DSHX 测试插件目录",
    seoDescription:
      locale === "en"
        ? "Review a verified DSH fixture plugin with sourced metadata, bilingual content, and deterministic archive checks."
        : "查看一个经过验证的 DSH 测试插件，包含有来源的元数据、双语内容和确定性归档检查结果。",
    sourceLocale: "en" as const,
    sourceContentHash: contentSourceHash,
    status: "ready" as const,
    translator: locale === "en" ? ("upstream" as const) : ("agent" as const),
  });
  return {
    schemaVersion: 2 as const,
    identity: { kind: "npm" as const, packageName: "@fixture/plugin" },
    contentSourceHash,
    sources,
    verification: {
      schemaVersion: 1 as const,
      checkerVersion: "3",
      checkedAt: observedAt,
      identityKey: "npm:@fixture/plugin",
      artifactSha256: "b".repeat(64),
      packageJsonSha256: "c".repeat(64),
      patchSha256: "d".repeat(64),
      packageName: "@fixture/plugin",
      packageVersion: "1.0.0",
      patchPath: "dsh.patch.json",
      dshxDetected: false,
      qualified: true as const,
      checks,
    },
    repository: {
      githubId: "123",
      nodeId: null,
      owner: {
        githubId: "456",
        login: "fixture",
        kind: "user" as const,
        displayName: "Fixture",
        avatarUrl: "https://avatars.githubusercontent.com/u/456",
        profileUrl: "https://github.com/fixture",
        bio: null,
        websiteUrl: null,
      },
      name: "plugin",
      fullName: "fixture/plugin",
      canonicalUrl: "https://github.com/fixture/plugin",
      defaultBranch: "main",
      description: "fixture",
      homepageUrl: null,
      topics: ["dsh-plugin"],
      primaryLanguage: "TypeScript",
      licenseSpdx: "MIT",
      isFork: false,
      isArchived: false,
      isDisabled: false,
      etag: null,
      sourceHash: "e".repeat(64),
      createdAt: observedAt,
      updatedAt: observedAt,
      pushedAt: observedAt,
    },
    repositoryPackage: {
      subdirectory: "",
      packageName: "@fixture/plugin",
      packageVersion: "1.0.0",
      packageJsonSha: "c".repeat(64),
      patchPath: "dsh.patch.json",
      patchSha: "d".repeat(64),
      npmPackageName: "@fixture/plugin",
      npmRegistryUrl: "https://www.npmjs.com/package/@fixture/plugin",
      installKind: "npm" as const,
      installSpec: "@fixture/plugin@1.0.0",
      dshBundle: true as const,
      dshxDetected: false,
      qualificationStatus: "verified" as const,
      consecutiveFailures: 0 as const,
      checks,
    },
    plugin: {
      requestedSlug: "fixture-plugin",
      packageName: "@fixture/plugin",
      latestVersion: "1.0.0",
      compatibilityRange: "dsh >=0.1",
      licenseSpdx: "MIT",
      homepageUrl: null,
      repositoryUrl: "https://github.com/fixture/plugin",
      dshxDetected: false,
    },
    localizations: [localization("en"), localization("zh")],
    installTargets: [
      {
        kind: "npm" as const,
        spec: "@fixture/plugin@1.0.0",
        packageName: "@fixture/plugin",
        version: "1.0.0",
        integrity: "sha512-fixture",
        primary: true,
      },
    ],
    releases: [
      {
        version: "1.0.0",
        channel: "stable" as const,
        gitTag: "v1.0.0",
        commitSha: null,
        compatibilityRange: "dsh >=0.1",
        compatibilitySource: "manifest" as const,
        releaseNotesUrl: null,
        deprecated: false,
        publishedAt: observedAt,
        dependencies: [],
      },
    ],
    categories: ["tools"],
    capabilities: [],
    links: [
      {
        kind: "repository" as const,
        url: "https://github.com/fixture/plugin",
        label: "GitHub",
      },
    ],
  };
}

afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("stable Agent-to-Hub operations", () => {
  it("accepts a sourced bilingual proposal and rejects unknown categories", () => {
    const candidate = proposal();
    expect(
      validateCatalogPage({ items: [candidate] }, ["tools"]),
    ).toMatchObject({
      valid: true,
      schemaVersion: 2,
    });
    candidate.categories = ["invented"];
    expect(() =>
      validateCatalogPage({ items: [candidate] }, ["tools"]),
    ).toThrow("Unknown controlled categories");
  });

  it("keeps volatile metrics outside the editorial content hash", () => {
    const candidate = proposal();
    const original = calculateContentSourceHash(candidate.sources);
    expect(calculateContentSourceHash(candidate.sources)).toBe(original);
    candidate.sources[0]!.sha256 = "f".repeat(64);
    expect(calculateContentSourceHash(candidate.sources)).not.toBe(original);
  });

  it("checks only local media and returns normalized bytes without fetching sourceUrl", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dshx-media-test-"));
    temporary.push(directory);
    const path = join(directory, "icon.png");
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48,
      0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1,
    ]);
    await writeFile(path, png);
    const result = await checkMedia({
      items: [
        {
          schemaVersion: 2,
          pluginId: crypto.randomUUID(),
          kind: "icon",
          sourceUrl: "https://source.invalid/icon.png",
          observedAt: new Date().toISOString(),
          sourceSha256: createHash("sha256").update(png).digest("hex"),
          localPath: path,
          localizations: [
            { locale: "en", altText: "Fixture icon" },
            { locale: "zh", altText: "测试图标" },
          ],
        },
      ],
    });
    expect(result.items[0]).toMatchObject({
      localPath: resolve(path),
      contentType: "image/png",
      width: 1,
      height: 1,
    });
  });

  it("contains no GitHub, npm, or remote-media collection implementation", async () => {
    const sourceDirectory = resolve(import.meta.dirname, "../src");
    const files = [
      "index.ts",
      "catalog.ts",
      "validate.ts",
      "metrics.ts",
      "targets.ts",
      "media.ts",
    ];
    const source = (
      await Promise.all(
        files.map((file) => readFile(join(sourceDirectory, file), "utf8")),
      )
    ).join("\n");
    expect(source).not.toContain("api.github.com");
    expect(source).not.toContain("registry.npmjs.org");
    expect(source).not.toContain("api.npmjs.org");
    expect(source).not.toContain("fetch(item.sourceUrl");
  });

  it("documents only the contracted stable command surface", () => {
    const root = helpText();
    expect(root).toContain("contract");
    expect(root).toContain("catalog");
    expect(helpText(["sync"])).toContain("put");
    expect(helpText(["sync"])).not.toContain("discover");
    expect(helpText(["metrics"])).toContain("submit");
    expect(helpText(["media"])).toContain("check");
    expect(helpText(["approvals", "create"])).toContain("Writes:");
    expect(helpText(["users", "role", "set"])).toContain("mandatory approval");
  });
});
