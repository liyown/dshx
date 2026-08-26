import { defineDocsChapter } from "../types";

const example = `import {
  analyzeDeclaredDshRange,
  assessProjectCompatibility,
  getCompatibilityCapabilities,
  projectCompatibilityDiagnostics,
  resolveCompatibility,
  resolveDshxConfig,
} from '@becomeopc/dshx/tooling'

const config = await resolveDshxConfig({ cwd: projectRoot })
const adapter = resolveCompatibility('0.1.1-rc.2')
const assessment = assessProjectCompatibility(config.manifest, '0.1.1-rc.2')
const diagnostics = projectCompatibilityDiagnostics(assessment, config.packageFile)
const capabilities = getCompatibilityCapabilities(adapter)`;

const migrationList = [
  "HostDefinition.api → apis: [registration]",
  "ClientDefinition.api/apis → remove; use Hooks inside retained Client code",
  "useQuery → useApiQuery",
  "Conversation Node plus Slot or .component() → defineConversation(...).render(Component)",
  "host: 'src/host.ts' → host: { entry: 'src/host.ts' }",
  "client: 'src/client.tsx' → client: { entry: 'src/client.tsx' }",
  "root imports other than defineConfig/DshxConfig → /host, /client, /api, or /settings",
  "/compiler, /compat, and /cli → /tooling",
] as const;

export const compatibility = defineDocsChapter({
  slug: "compatibility",
  group: "runtime",
  copy: {
    en: {
      navigation: "Tooling API",
      eyebrow: "10 · Experimental Tooling",
      title: "Diagnostics, compatibility, and project tooling",
      intro:
        "Use one Node-only entry for config resolution, builds, compatibility analysis, CLI embedding, diagnostics, and transactional project repair.",
      description:
        "@becomeopc/dshx/tooling exports, protocol-1 capabilities, provider edges, offline migration diagnostics, and support boundaries.",
      sections: [
        {
          id: "entry",
          label: "@becomeopc/dshx/tooling",
          title: "Node-only tooling entry",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "resolveDshxConfig",
                  type: "Promise<ResolvedDshxConfig>",
                  body: "Loads and normalizes the bounded project config without changing files.",
                },
                {
                  name: "buildHost / buildClient",
                  type: "Promise<BuildReport>",
                  body: "Programmatic single-face production builds.",
                },
                {
                  name: "watchHost / watchClient",
                  type: "Promise<BuildWatcher>",
                  body: "Programmatic single-face build watchers.",
                },
                {
                  name: "parseCliArgs / runCli",
                  type: "CLI embedding",
                  body: "Parse or execute the public CLI with injectable I/O/runtime dependencies.",
                },
                {
                  name: "DshxError / DshxDiagnostic",
                  type: "diagnostics",
                  body: "Stable diagnostic codes and structured file/hint metadata.",
                },
                {
                  name: "create/apply/rollbackManifestRepairPlan",
                  type: "project repair",
                  body: "Plan read-only manifest changes, apply explicitly, and restore prior bytes when required.",
                },
              ],
            },
            {
              kind: "note",
              text: "Tooling is Experimental and Node-only. Do not import it from Host/Client shared contracts or browser code.",
            },
          ],
        },
        {
          id: "compatibility",
          title: "Compatibility registry",
          blocks: [
            { kind: "code", title: "Programmatic analysis", code: example },
            {
              kind: "api",
              rows: [
                {
                  name: "analyzeDeclaredDshRange",
                  type: "range status",
                  body: "Classifies a public DSH peer range as one generation, spanning, partial, unsupported, or invalid.",
                },
                {
                  name: "resolveCompatibility",
                  type: "DshCompatibility",
                  body: "Selects the adapter for one installed DSH version or throws a diagnostic.",
                },
                {
                  name: "assessProjectCompatibility",
                  type: "assessment",
                  body: "Combines declared, development, installed, adapter, and capability facts.",
                },
                {
                  name: "projectCompatibilityDiagnostics",
                  type: "readonly DshxDiagnostic[]",
                  body: "Converts the assessment into actionable check/build diagnostics.",
                },
                {
                  name: "getCompatibilityCapabilities",
                  type: "readonly string[]",
                  body: "Returns stable Host/Client capability identifiers for reports and smoke tests.",
                },
              ],
            },
          ],
        },
        {
          id: "boundaries",
          title: "protocol-1 boundaries and provider edges",
          blocks: [
            {
              kind: "paragraph",
              text: "The verified DSH boundaries remain 0.1.0-rc.8 and 0.1.1-rc.2. protocol-1 records Host Tool, Command, Prompt Section/Context, Settings and API capabilities plus Client Settings Scope, Slot, Hook-driven API/Settings inference, and the available Experimental Conversation seams.",
            },
            {
              kind: "list",
              items: [
                "Prompt requires the official dsh-system-prompt package edge.",
                "Host Settings requires dsh-settings and Schemastery; useSettings requires dsh-client-ui-settings.",
                "useApi and useApiQuery require dsh-client-connection.",
                "Slots and Conversation require the provider packages recorded by the selected Slot/Event adapter.",
                "An adjacent DSH source checkout is not a published compatibility claim.",
              ],
            },
          ],
        },
        {
          id: "migration",
          title: "0.1.1 → 0.1.2 diagnostics",
          blocks: [
            { kind: "list", items: migrationList },
            {
              kind: "paragraph",
              text: "dshx check reports these changes with source locations before a build. The development release has no runtime aliases; update source code and imports directly.",
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "Tooling API",
      eyebrow: "10 · Experimental Tooling",
      title: "诊断、兼容性与项目工具",
      intro:
        "通过一个 Node-only 入口使用 config resolver、build、兼容性分析、CLI embedding、诊断和事务式项目修复。",
      description:
        "@becomeopc/dshx/tooling export、protocol-1 能力、Provider edge、离线迁移诊断与支持边界。",
      sections: [
        {
          id: "entry",
          label: "@becomeopc/dshx/tooling",
          title: "Node-only Tooling 入口",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "resolveDshxConfig",
                  type: "Promise<ResolvedDshxConfig>",
                  body: "加载并标准化受限项目 config，不修改文件。",
                },
                {
                  name: "buildHost / buildClient",
                  type: "Promise<BuildReport>",
                  body: "程序化单 face 生产构建。",
                },
                {
                  name: "watchHost / watchClient",
                  type: "Promise<BuildWatcher>",
                  body: "程序化单 face build watcher。",
                },
                {
                  name: "parseCliArgs / runCli",
                  type: "CLI embedding",
                  body: "通过可注入 I/O/Runtime dependency 解析或执行公开 CLI。",
                },
                {
                  name: "DshxError / DshxDiagnostic",
                  type: "诊断",
                  body: "稳定诊断码与结构化 file/hint metadata。",
                },
                {
                  name: "create/apply/rollbackManifestRepairPlan",
                  type: "项目修复",
                  body: "只读规划 manifest 修改、显式 apply，并在需要时恢复之前的字节。",
                },
              ],
            },
            {
              kind: "note",
              text: "Tooling 是 Experimental 且 Node-only；不得从 Host/Client 共享 contract 或浏览器代码导入。",
            },
          ],
        },
        {
          id: "compatibility",
          title: "兼容性 registry",
          blocks: [
            { kind: "code", title: "程序化分析", code: example },
            {
              kind: "api",
              rows: [
                {
                  name: "analyzeDeclaredDshRange",
                  type: "range status",
                  body: "把公开 DSH peer range 分类为单 generation、跨 generation、部分支持、不支持或无效。",
                },
                {
                  name: "resolveCompatibility",
                  type: "DshCompatibility",
                  body: "为一个已安装 DSH 版本选择 adapter，否则抛出诊断。",
                },
                {
                  name: "assessProjectCompatibility",
                  type: "assessment",
                  body: "组合 declared、development、installed、adapter 和 capability 事实。",
                },
                {
                  name: "projectCompatibilityDiagnostics",
                  type: "readonly DshxDiagnostic[]",
                  body: "把 assessment 转换为可执行 check/build 诊断。",
                },
                {
                  name: "getCompatibilityCapabilities",
                  type: "readonly string[]",
                  body: "返回用于报告和 smoke 的稳定 Host/Client capability id。",
                },
              ],
            },
          ],
        },
        {
          id: "boundaries",
          title: "protocol-1 边界与 Provider edge",
          blocks: [
            {
              kind: "paragraph",
              text: "已验证 DSH 边界仍是 0.1.0-rc.8 和 0.1.1-rc.2。protocol-1 记录 Host Tool、Command、Prompt Section/Context、Settings 和 API 能力，以及 Client Settings Scope、Slot、Hook 驱动 API/Settings 推断和可用 Experimental Conversation seam。",
            },
            {
              kind: "list",
              items: [
                "Prompt 需要官方 dsh-system-prompt package edge。",
                "Host Settings 需要 dsh-settings 和 Schemastery；useSettings 需要 dsh-client-ui-settings。",
                "useApi 和 useApiQuery 需要 dsh-client-connection。",
                "Slot 和 Conversation 需要选中 Slot/Event adapter 记录的 Provider package。",
                "相邻 DSH source checkout 不构成已发布兼容性声明。",
              ],
            },
          ],
        },
        {
          id: "migration",
          title: "0.1.1 → 0.1.2 诊断",
          blocks: [
            { kind: "list", items: migrationList },
            {
              kind: "paragraph",
              text: "dshx check 在 build 前以源位置报告这些改动。开发版不提供 Runtime alias；直接更新源码和 import。",
            },
          ],
        },
      ],
    },
  },
});
