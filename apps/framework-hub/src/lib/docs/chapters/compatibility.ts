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
const adapter = resolveCompatibility('0.2.1-rc.2')
const assessment = assessProjectCompatibility(config.manifest, '0.2.1-rc.2')
const diagnostics = projectCompatibilityDiagnostics(assessment, config.packageFile)
const capabilities = getCompatibilityCapabilities(adapter)`;

const migrationList = [
  "defineSettings / settingsScope → plugin Config plus SettingsForms / configForms",
  "conversationEvents → ctx.uiConversation.events.register",
  "connection.api and authority → rpc.handle(channel, handler) with peer and ctx.remote",
  "prompt persona → personaPrefix / personaSuffix",
  "command input.images → input.attachments",
  "tool mode: 'both' → explicit native or PTC face",
  "DSH peer range → engines.dsh with peerDependencies fallback",
  "@deepseek-ai/dsh-client-runtime → official renderer, store, settings, and conversation packages",
] as const;

const migrationListZh = [
  "defineSettings / settingsScope → 插件 Config 加 SettingsForms / configForms",
  "conversationEvents → ctx.uiConversation.events.register",
  "connection.api 与 authority → rpc.handle(channel, handler) 加 peer 和 ctx.remote",
  "prompt persona → personaPrefix / personaSuffix",
  "command input.images → input.attachments",
  "tool mode: 'both' → 明确选择 native 或 PTC face",
  "DSH peer range → 优先 engines.dsh，回退 peerDependencies",
  "@deepseek-ai/dsh-client-runtime → 官方 renderer、store、settings 与 conversation 包",
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
        "Use a single Node-only entry to resolve config, run builds, analyze compatibility, embed the CLI, produce diagnostics, and repair projects transactionally.",
      description:
        "@becomeopc/dshx/tooling exports, protocol-2 capabilities, provider edges, offline migration diagnostics, and support boundaries.",
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
          title: "protocol-2 boundary and provider edges",
          blocks: [
            {
              kind: "paragraph",
              text: "Compatibility evidence comes from the source tag dsh-v0.2.1-rc.2. The earlier npm 0.2.1-rc.2 artifact is stale and is diagnosed, not marked verified. protocol-2 records Host Tool, Command, Prompt Section/Context, Config and API capabilities plus Client Locale, Config Forms, compile-time Slots, Hook-driven API inference, and the Experimental Conversation surface.",
            },
            {
              kind: "list",
              items: [
                "Prompt requires the official dsh-system-prompt package edge.",
                "Plugin Config and SettingsForms require Schemastery and dsh-client-ui-settings; useSettings reads configForms by Host entry id.",
                "defineLocale requires the dsh-client-locale package edge; its declarative contribution adds the Locale service automatically.",
                "useApi and useApiQuery require dsh-client-connection and the generated ctx.remote namespace.",
                "Conversation requires dsh-client-ui-conversation; Slots are compile-time provider contracts, not runtime catalog entries.",
                "An adjacent DSH source checkout is not a published compatibility claim.",
              ],
            },
          ],
        },
        {
          id: "migration",
          title: "0.1 → 0.2 diagnostics",
          blocks: [
            { kind: "list", items: migrationList },
            {
              kind: "paragraph",
              text: "dshx check reports these changes with source locations before a build. The 0.2 release has no runtime aliases; update source code and imports directly.",
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
        "通过单一 Node-only 入口解析 config、执行 build、分析兼容性、嵌入 CLI、生成诊断并事务式修复项目。",
      description:
        "@becomeopc/dshx/tooling export、protocol-2 能力、Provider edge、离线迁移诊断与支持边界。",
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
          title: "protocol-2 边界与 Provider edge",
          blocks: [
            {
              kind: "paragraph",
              text: "兼容性证据来自源码 tag dsh-v0.2.1-rc.2。更早发布的 npm 0.2.1-rc.2 产物已陈旧，只会给出诊断，不会标记为已验证。protocol-2 记录 Host Tool、Command、Prompt Section/Context、Config 和 API 能力，以及 Client Locale、Config Forms、编译期 Slot、Hook 驱动 API 推断和 Experimental Conversation 能力。",
            },
            {
              kind: "list",
              items: [
                "Prompt 需要官方 dsh-system-prompt package edge。",
                "插件 Config 与 SettingsForms 需要 Schemastery 和 dsh-client-ui-settings；useSettings 按 Host entry id 读取 configForms。",
                "defineLocale 需要 dsh-client-locale package edge；它的声明式贡献会自动添加 Locale Service。",
                "useApi 和 useApiQuery 需要 dsh-client-connection 以及生成的 ctx.remote namespace。",
                "Conversation 需要 dsh-client-ui-conversation；Slot 是编译期 Provider 契约，不是 Runtime catalog 条目。",
                "相邻 DSH source checkout 不构成已发布兼容性声明。",
              ],
            },
          ],
        },
        {
          id: "migration",
          title: "0.1 → 0.2 诊断",
          blocks: [
            { kind: "list", items: migrationListZh },
            {
              kind: "paragraph",
              text: "dshx check 在 build 前以源位置报告这些改动。0.2 不提供 Runtime alias；直接更新源码和 import。",
            },
          ],
        },
      ],
    },
  },
});
