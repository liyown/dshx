import { defineDocsChapter } from "../types";

const compatExample = `import {
  analyzeDeclaredDshRange,
  assessProjectCompatibility,
  classifyCompatibility,
  projectCompatibilityDiagnostics,
  resolveCompatibility,
} from '@becomeopc/dshx/compat'

const range = analyzeDeclaredDshRange('>=0.1.0-rc.8 <0.2.0')
const assessment = assessProjectCompatibility(packageJson, installedVersion)
const diagnostics = projectCompatibilityDiagnostics(assessment, packageFile)
const resolution = classifyCompatibility('0.1.1-rc.2')
const adapter = resolveCompatibility('0.1.1-rc.2')`;

export const compatibility = defineDocsChapter({
  slug: "compatibility",
  group: "runtime",
  copy: {
    en: {
      navigation: "Compatibility API",
      eyebrow: "08 · API reference",
      title: "Compatibility API",
      intro:
        "The installed DSH version selects an adapter generation. Published semver alone does not prove that a runtime contract is available or verified.",
      description:
        "Understand DSHX protocol adapters, verified DSH boundaries, provider edges, and runtime-thin compatibility rules.",
      sections: [
        {
          id: "module-api",
          label: "@becomeopc/dshx/compat",
          title: "Programmatic compatibility functions",
          blocks: [
            { kind: "code", title: "Example", code: compatExample },
            {
              kind: "api",
              rows: [
                {
                  name: "declaredDshRange(manifest)",
                  type: "string | undefined",
                  body: "Reads @deepseek-ai/dsh from peerDependencies.",
                },
                {
                  name: "developmentDshSpecifier(manifest)",
                  type: "string | undefined",
                  body: "Reads the local test/build specifier from devDependencies.",
                },
                {
                  name: "detectInstalledDshVersion(packageFile)",
                  type: "string | undefined",
                  body: "Resolves the project-local official DSH package without executing the CLI.",
                },
                {
                  name: "analyzeDeclaredDshRange(range, adapters?)",
                  type: "DshDeclaredRangeAnalysis",
                  body: "Classifies one public range as single-generation, spanning, partial, unsupported, or invalid.",
                },
                {
                  name: "classifyCompatibility(version)",
                  type: "DshCompatibilityResolution | undefined",
                  body: "Returns adapter plus verified/compatible/experimental status for a valid supported version.",
                },
                {
                  name: "resolveCompatibility(version)",
                  type: "DshCompatibility",
                  body: "Returns the adapter or throws DSHX5101 for unsupported input.",
                },
                {
                  name: "resolveDeclaredCompatibility(manifest)",
                  type: "DshCompatibilityResolution | undefined",
                  body: "Selects an adapter only when the declared peer range maps cleanly to one generation.",
                },
                {
                  name: "assessProjectCompatibility(manifest, installed?)",
                  type: "DshProjectCompatibilityAssessment",
                  body: "Collects declared, development, installed, adapter, and capability facts.",
                },
                {
                  name: "projectCompatibilityDiagnostics(assessment, file, options?)",
                  type: "readonly DshxDiagnostic[]",
                  body: "Converts an assessment into actionable build/check diagnostics.",
                },
                {
                  name: "getCompatibilityCapabilities(adapter)",
                  type: "readonly string[]",
                  body: "Produces stable human/machine-readable capability identifiers.",
                },
                {
                  name: "getCompatibilitySmokeMatrix()",
                  type: "readonly MatrixEntry[]",
                  body: "Returns minimum/latest verified versions used by real-runtime CI.",
                },
              ],
            },
            {
              kind: "note",
              text: "DEFAULT_COMPATIBILITY and COMPATIBILITY_ADAPTERS are exported for tooling. Prefer the functions above instead of selecting an adapter by array position.",
            },
          ],
        },
        {
          id: "generation",
          title: "Adapter generation, not semver alias",
          blocks: [
            {
              kind: "paragraph",
              text: "The current adapter is protocol-1. It records the official package edges, service names, contribution seams, and verification status used by build, check, dev, and smoke tests. It is not a mechanical alias for every DSH 0.1 release.",
            },
            {
              kind: "api",
              rows: [
                {
                  name: "verified",
                  type: "known published boundary",
                  body: "The exact DSH version passed the real package and Composition smoke for the declared capabilities.",
                },
                {
                  name: "compatible",
                  type: "stable range",
                  body: "A stable release resolves to a known adapter generation within its declared compatibility interval.",
                },
                {
                  name: "experimental",
                  type: "unverified prerelease",
                  body: "A prerelease uses a known generation adapter with an explicit warning instead of being presented as verified.",
                },
                {
                  name: "unsupported",
                  type: "no safe adapter",
                  body: "DSHX stops with a diagnostic because the installed runtime cannot be mapped safely.",
                },
              ],
            },
          ],
        },
        {
          id: "boundaries",
          title: "Current verification boundaries",
          blocks: [
            {
              kind: "paragraph",
              text: "The current protocol-1 verification boundaries are DSH 0.1.0-rc.8 and 0.1.1-rc.2. Host Tools, Commands, Prompt Sections and Contexts, Settings, Client Settings Scope, typed API Connection wiring, Slots, and the available Conversation seams are described separately in the registry.",
            },
            {
              kind: "note",
              text: "Conversation remains experimental even though its current adapter seam is implemented. Capability status is more precise than the status of the adapter generation as a whole.",
            },
          ],
        },
        {
          id: "edges",
          title: "Official provider package edges are part of the contract",
          blocks: [
            {
              kind: "list",
              items: [
                "Host Prompt contributions require the official system-prompt provider edge.",
                "Host Settings ownership requires dsh-settings and Schemastery.",
                "Client useSettings requires dsh-client-ui-settings in dsh.client.inject.",
                "Client useApi/useQuery requires dsh-client-connection in dsh.client.inject.",
                "Conversation components require the official Client Runtime and Conversation UI package edges recorded by protocol-1.",
              ],
            },
            {
              kind: "paragraph",
              text: "dshx check reports these relationships early. For hook-driven API and Settings usage, build and dev perform the authoritative post-tree-shaking check. Explicit Conversation contributions are validated from defineClient({ conversations }) and their provider edges before bundling.",
            },
          ],
        },
        {
          id: "policy",
          title: "Compatibility does not add a fallback runtime",
          blocks: [
            {
              kind: "paragraph",
              text: "Adapters normalize known official seams. They do not emulate missing DSH services, fabricate Inspect catalogs, own official lifecycle rules, or claim compatibility from an adjacent source checkout.",
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "兼容性 API",
      eyebrow: "08 · API 参考",
      title: "兼容性 API",
      intro:
        "已安装的 DSH 版本选择 adapter generation；仅凭发布 semver 不能证明某个 Runtime contract 已存在或已验证。",
      description:
        "理解 DSHX protocol adapter、已验证 DSH 边界、Provider edge 与 runtime-thin 兼容规则。",
      sections: [
        {
          id: "module-api",
          label: "@becomeopc/dshx/compat",
          title: "程序化兼容性函数",
          blocks: [
            { kind: "code", title: "示例", code: compatExample },
            {
              kind: "api",
              rows: [
                {
                  name: "declaredDshRange(manifest)",
                  type: "string | undefined",
                  body: "读取 peerDependencies 中的 @deepseek-ai/dsh。",
                },
                {
                  name: "developmentDshSpecifier(manifest)",
                  type: "string | undefined",
                  body: "读取 devDependencies 中用于本地测试/构建的 specifier。",
                },
                {
                  name: "detectInstalledDshVersion(packageFile)",
                  type: "string | undefined",
                  body: "不执行 CLI，直接解析项目本地官方 DSH package。",
                },
                {
                  name: "analyzeDeclaredDshRange(range, adapters?)",
                  type: "DshDeclaredRangeAnalysis",
                  body: "把公开范围分类为单 generation、跨 generation、部分支持、不支持或无效。",
                },
                {
                  name: "classifyCompatibility(version)",
                  type: "DshCompatibilityResolution | undefined",
                  body: "为有效且受支持版本返回 adapter 与 verified/compatible/experimental 状态。",
                },
                {
                  name: "resolveCompatibility(version)",
                  type: "DshCompatibility",
                  body: "返回 adapter；不支持时抛出 DSHX5101。",
                },
                {
                  name: "resolveDeclaredCompatibility(manifest)",
                  type: "DshCompatibilityResolution | undefined",
                  body: "只有 peer range 清晰映射到一个 generation 时才选择 adapter。",
                },
                {
                  name: "assessProjectCompatibility(manifest, installed?)",
                  type: "DshProjectCompatibilityAssessment",
                  body: "收集声明、本地开发、已安装版本、adapter 与 capability 事实。",
                },
                {
                  name: "projectCompatibilityDiagnostics(assessment, file, options?)",
                  type: "readonly DshxDiagnostic[]",
                  body: "把 assessment 转成 build/check 使用的可操作诊断。",
                },
                {
                  name: "getCompatibilityCapabilities(adapter)",
                  type: "readonly string[]",
                  body: "输出稳定、适合人和机器读取的 capability identifier。",
                },
                {
                  name: "getCompatibilitySmokeMatrix()",
                  type: "readonly MatrixEntry[]",
                  body: "返回真实 Runtime CI 使用的最小/最新已验证版本。",
                },
              ],
            },
            {
              kind: "note",
              text: "工具也可使用 DEFAULT_COMPATIBILITY 与 COMPATIBILITY_ADAPTERS；不要按数组位置选择 adapter，优先调用上述函数。",
            },
          ],
        },
        {
          id: "generation",
          title: "Adapter generation 不是 semver 别名",
          blocks: [
            {
              kind: "paragraph",
              text: "当前 adapter 是 protocol-1，记录 build、check、dev 与 smoke 所使用的官方 package edge、Service 名称、贡献 seam 与验证状态；它不是所有 DSH 0.1 版本的机械别名。",
            },
            {
              kind: "api",
              rows: [
                {
                  name: "verified",
                  type: "已知发布边界",
                  body: "确切 DSH 版本已通过所声明能力的真实 package 与 Composition smoke。",
                },
                {
                  name: "compatible",
                  type: "稳定范围",
                  body: "稳定版本位于声明的兼容区间，并解析到已知 adapter generation。",
                },
                {
                  name: "experimental",
                  type: "未验证 prerelease",
                  body: "预发布版本使用已知 generation adapter，并明确警告，不伪装成 verified。",
                },
                {
                  name: "unsupported",
                  type: "无安全 adapter",
                  body: "已安装 Runtime 无法安全映射时，DSHX 用诊断停止。",
                },
              ],
            },
          ],
        },
        {
          id: "boundaries",
          title: "当前验证边界",
          blocks: [
            {
              kind: "paragraph",
              text: "当前 protocol-1 验证边界为 DSH 0.1.0-rc.8 与 0.1.1-rc.2。Host Tool、Command、Prompt Section 与 Context、Settings、Client Settings Scope、类型化 API Connection 接线、Slot 与可用 Conversation seam 分别记录在 registry。",
            },
            {
              kind: "note",
              text: "Conversation 的当前 adapter seam 已实现，但能力仍为 experimental。单项 capability status 比整个 adapter generation 的状态更精确。",
            },
          ],
        },
        {
          id: "edges",
          title: "官方 Provider package edge 属于契约",
          blocks: [
            {
              kind: "list",
              items: [
                "Host Prompt 贡献要求官方 system-prompt Provider edge。",
                "Host Settings 所有权要求 dsh-settings 与 Schemastery。",
                "Client useSettings 要求 dsh.client.inject 包含 dsh-client-ui-settings。",
                "Client useApi/useQuery 要求 dsh.client.inject 包含 dsh-client-connection。",
                "Conversation Component 要求 protocol-1 记录的官方 Client Runtime 与 Conversation UI package edge。",
              ],
            },
            {
              kind: "paragraph",
              text: "dshx check 会提前报告这些关系。对于 Hook 驱动的 API 与 Settings，build 和 dev 在 tree-shaking 后权威复核；显式 Conversation 贡献则在 bundle 前根据 defineClient({ conversations }) 与 Provider edge 校验。",
            },
          ],
        },
        {
          id: "policy",
          title: "兼容性不增加 fallback Runtime",
          blocks: [
            {
              kind: "paragraph",
              text: "adapter 只规范已知官方 seam，不模拟缺失的 DSH Service、不虚构 Inspect catalog、不接管官方生命周期，也不依据相邻源码 checkout 宣称兼容。",
            },
          ],
        },
      ],
    },
  },
});
