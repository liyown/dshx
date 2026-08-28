import { defineDocsChapter } from "../types";

export const publishing = defineDocsChapter({
  slug: "publishing",
  group: "runtime",
  lastVerified: "2026-08-28",
  references: [
    {
      label: "Publishing guide",
      url: "https://github.com/liyown/dshx/blob/main/docs/guides/publishing.md",
    },
    { label: "npm package", url: "https://www.npmjs.com/package/@becomeopc/dshx" },
  ],
  copy: {
    en: {
      navigation: "Publishing",
      eyebrow: "Release and catalog",
      title: "Publish a DSH plugin",
      intro:
        "A publishable DSH plugin needs explicit runtime compatibility, one reproducible installation target, a public source repository, and enough evidence for developers to evaluate it before installation.",
      description:
        "Prepare, release, and submit a DeepSeek Harness plugin with explicit compatibility, provenance, and an exact installation target.",
      sections: [
        {
          id: "prepare",
          label: "01 / prepare",
          title: "Prepare the package",
          blocks: [
            {
              kind: "list",
              items: [
                "Declare the public DSH support range in peerDependencies and keep one concrete DSH version in devDependencies.",
                "Publish a README that explains purpose, permissions, configuration, installation, compatibility, known limits, and license.",
                "Keep repository, package name, version, license, and issue URL consistent between npm and GitHub.",
                "Run pnpm check and pnpm build before creating a release.",
              ],
            },
            {
              kind: "note",
              text: "Verified for @becomeopc/dshx 0.1.4-preview.0 and protocol-1 DSH boundaries 0.1.0-rc.8 and 0.1.1-rc.2. Re-check the compatibility page before publishing a later Preview.",
            },
          ],
        },
        {
          id: "release",
          label: "02 / release",
          title: "Create a reproducible release",
          blocks: [
            {
              kind: "terminal",
              title: "terminal",
              lines: [
                { text: "pnpm check", kind: "cmd" },
                { text: "pnpm build", kind: "cmd" },
                { text: "npm publish --provenance", kind: "cmd" },
              ],
            },
            {
              kind: "note",
              text: "A Git branch is not equivalent to an immutable release. Prefer an exact npm version or a stable repository tag that matches the published source.",
            },
          ],
        },
        {
          id: "submit",
          label: "03 / submit",
          title: "Submit to DSHX Hub",
          blocks: [
            {
              kind: "paragraph",
              text: "Submit the root URL of a public GitHub repository. Hub records the exact README, publisher identity, installation target, version, compatibility, and curated bilingual overview. Listing does not certify plugin security or runtime behavior.",
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "发布插件",
      eyebrow: "发布与收录",
      title: "发布 DSH 插件",
      intro:
        "可发布的 DSH 插件需要明确 Runtime 兼容范围、一个可复现的安装目标、公开源码仓库，以及足以让开发者在安装前判断风险的证据。",
      description: "以明确兼容性、来源证据和精确安装目标准备、发布并提交 DeepSeek Harness 插件。",
      sections: [
        {
          id: "prepare",
          label: "01 / prepare",
          title: "准备包",
          blocks: [
            {
              kind: "list",
              items: [
                "在 peerDependencies 声明公开 DSH 支持范围，在 devDependencies 保留一个具体开发版本。",
                "README 需要说明用途、权限、配置、安装、兼容性、已知限制和许可证。",
                "确保 npm 与 GitHub 的仓库、包名、版本、许可证和 Issue 地址一致。",
                "创建 Release 前运行 pnpm check 与 pnpm build。",
              ],
            },
            {
              kind: "note",
              text: "本文已按 @becomeopc/dshx 0.1.4-preview.0，以及 protocol-1 的 DSH 0.1.0-rc.8 与 0.1.1-rc.2 边界验证；发布后续 Preview 前请重新检查兼容性页面。",
            },
          ],
        },
        {
          id: "release",
          label: "02 / release",
          title: "创建可复现 Release",
          blocks: [
            {
              kind: "terminal",
              title: "terminal",
              lines: [
                { text: "pnpm check", kind: "cmd" },
                { text: "pnpm build", kind: "cmd" },
                { text: "npm publish --provenance", kind: "cmd" },
              ],
            },
            {
              kind: "note",
              text: "Git Branch 不等于不可变 Release。优先使用精确 npm 版本，或与发布源码一致的稳定仓库 Tag。",
            },
          ],
        },
        {
          id: "submit",
          label: "03 / submit",
          title: "提交到 DSHX Hub",
          blocks: [
            {
              kind: "paragraph",
              text: "提交公开 GitHub 仓库的根地址。Hub 会记录精确 README、发布者身份、安装目标、版本、兼容性和双语策展内容；收录不代表 Hub 为插件安全性或运行行为背书。",
            },
          ],
        },
      ],
    },
  },
});
