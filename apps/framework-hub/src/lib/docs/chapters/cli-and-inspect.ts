import { defineDocsChapter } from "../types";

const configExample = `// dshx.config.ts
import { defineConfig } from '@becomeopc/dshx/config'

export default defineConfig({
  name: 'status-plugin',
  host: 'src/host.ts',       // string or false
  client: 'src/client.tsx',  // string or false
  profile: 'web',
  dev: { hostRestart: 'manual' },
  build: { sourcemap: true },
  compatibility: { allowUnsupported: false },
})`;

const compilerSignature = `import { buildClient, buildHost } from '@becomeopc/dshx/compiler'

await buildHost({
  packageId, outDir, entry?, root?, logicalName?,
  sourcemap?, watch?, compatibility?,
})

await buildClient({
  packageId, entry, outDir, root?, logicalName?,
  sourcemap?, watch?, external?, inject?, compatibility?,
})`;

const cliSignature = `import { parseCliArgs, runCli, CliUsageError } from '@becomeopc/dshx/cli'

const args = parseCliArgs(['build', '--cwd', projectRoot])
const exitCode = await runCli(['check', '--json'], {
  cwd: projectRoot,
  version: '0.1.0',
  io: { stdin, stdout, stderr },
  runtime: { /* optional dependency overrides for embedding/tests */ },
})`;

export const cliAndInspect = defineDocsChapter({
  slug: "cli-and-inspect",
  group: "runtime",
  copy: {
    en: {
      navigation: "Config, compiler, and CLI",
      eyebrow: "07 · API reference",
      title: "Config, compiler, and CLI",
      intro:
        "Use the project CLI for deterministic builds and scaffolds, then inspect the live DSH composition before binding to provider-owned runtime contracts.",
      description: "Use dshx build, check, dev, inspect, and transactional scaffold commands.",
      sections: [
        {
          id: "configuration",
          title: "defineConfig(config) and resolveDshxConfig(options?)",
          blocks: [
            { kind: "code", title: "dshx.config.ts", code: configExample },
            {
              kind: "api",
              rows: [
                {
                  name: "defineConfig(config)",
                  type: "T",
                  body: "Identity helper that contextually types DshxConfig and preserves the exact object.",
                },
                {
                  name: "host / client",
                  type: "string | false",
                  body: "Override an entry path or disable that side. Defaults are src/host.ts and src/client.tsx when present.",
                },
                { name: "profile", type: "string", body: "DSH Profile name; defaults to web." },
                {
                  name: "dev.hostRestart",
                  type: "'manual' | 'auto'",
                  body: "Host restart policy; defaults to manual.",
                },
                {
                  name: "build.sourcemap",
                  type: "boolean",
                  body: "Production/source watch sourcemap switch; defaults to true.",
                },
                {
                  name: "compatibility.allowUnsupported",
                  type: "boolean",
                  body: "Explicit opt-in to continue on unsupported compatibility; defaults to false.",
                },
                {
                  name: "resolveDshxConfig({ cwd? })",
                  type: "Promise<ResolvedDshxConfig>",
                  body: "Discovers and normalizes a project without changing files.",
                },
              ],
            },
          ],
        },
        {
          id: "commands",
          title: "Project commands",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "dshx dev",
                  type: "development",
                  body: "Build, link, watch, and run the plugin in DSH.",
                },
                {
                  name: "dshx build",
                  type: "production",
                  body: "Validate the Manifest and emit every enabled Host and Client artifact.",
                },
                {
                  name: "dshx check",
                  type: "diagnostics",
                  body: "Check metadata, compatibility, Profile linkage, provider package edges, and runtime bridge status.",
                },
                {
                  name: "dshx inspect <kind>",
                  type: "live runtime",
                  body: "Read an adapter-supported target from the active DSH Composition. protocol-1 currently exposes Slots, Services, and Events; Tool discovery reports an explicit unavailable diagnostic.",
                },
              ],
            },
            {
              kind: "note",
              text: "check and inspect are read-only by default. build writes declared production artifacts; check writes project metadata only with an explicit --fix, so use --dry-run first. Add --json where supported for automation.",
            },
          ],
        },
        {
          id: "inspect",
          title: "Inspect before scaffolding",
          blocks: [
            {
              kind: "paragraph",
              text: "Inspect reads the current running Composition instead of inventing an offline catalog. Discover a provider's exact Slot contract first, then generate code against that runtime evidence.",
            },
            {
              kind: "terminal",
              lines: [
                { text: "dshx inspect slots", kind: "cmd" },
                { text: "sidebar.footer.action · list · @provider/plugin", kind: "accent" },
                { text: "dshx add ui --slot sidebar.footer.action --dry-run", kind: "cmd" },
                { text: "would create src/ui/sidebar-footer-action.tsx", kind: "ok" },
              ],
            },
          ],
        },
        {
          id: "scaffolds",
          title: "Transactional source scaffolds",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "dshx add ui --slot <name>",
                  type: "Client",
                  body: "Generates and registers a typed React Slot contribution.",
                },
                {
                  name: "dshx add tool --name <name>",
                  type: "Host",
                  body: "Generates an official Tool and attaches it to defineHost.",
                },
                {
                  name: "dshx add command --name <name>",
                  type: "Host",
                  body: "Generates an official Command and attaches it to defineHost.",
                },
                {
                  name: "dshx add hook --event <name>",
                  type: "Host",
                  body: "Generates a native Cordis event listener.",
                },
              ],
            },
            {
              kind: "paragraph",
              text: "Scaffolds plan all source changes before writing and roll back partial writes. They do not install dependencies or mutate DSH Profiles.",
            },
          ],
        },
        {
          id: "compiler",
          title: "buildHost(options) and buildClient(options)",
          blocks: [
            {
              kind: "paragraph",
              text: "Use @becomeopc/dshx/compiler only when embedding the compiler. Normal projects should use dshx build/dev so config, manifest, compatibility, and profile checks also run.",
            },
            { kind: "code", title: "Programmatic compiler", code: compilerSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "packageId",
                  type: "string · required",
                  body: "Published package identity used by both compilers.",
                },
                {
                  name: "entry",
                  type: "string",
                  body: "Client: required. Host: optional, producing an empty Host module when omitted.",
                },
                { name: "outDir", type: "string · required", body: "Artifact output directory." },
                {
                  name: "root / logicalName",
                  type: "string",
                  body: "Optional project root and runtime-visible logical name.",
                },
                {
                  name: "sourcemap / watch",
                  type: "boolean",
                  body: "Enable sourcemaps or return a live watcher build.",
                },
                {
                  name: "external",
                  type: "readonly string[] · Client",
                  body: "Additional Client externals.",
                },
                {
                  name: "inject",
                  type: "readonly string[] · Client",
                  body: "Manifest package edges from dsh.client.inject, used by capability diagnostics.",
                },
                {
                  name: "compatibility",
                  type: "DshCompatibility",
                  body: "Resolved adapter contract; defaults apply only where the compiler explicitly supplies them.",
                },
              ],
            },
          ],
        },
        {
          id: "programmatic-cli",
          title: "parseCliArgs() and runCli()",
          blocks: [
            { kind: "code", title: "Embedding the CLI", code: cliSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "parseCliArgs(argv)",
                  type: "CliArgs",
                  body: "Parses arguments without executing a command; invalid combinations throw CliUsageError.",
                },
                {
                  name: "runCli(argv, options?)",
                  type: "Promise<number>",
                  body: "Runs one command and resolves an exit code instead of exiting the process.",
                },
                {
                  name: "options.io",
                  type: "CliIO",
                  body: "Optional stdin/stdout/stderr streams.",
                },
                {
                  name: "options.runtime",
                  type: "CliRuntime",
                  body: "Optional dependency overrides for embedded hosts and tests.",
                },
                {
                  name: "options.cwd / version",
                  type: "string",
                  body: "Default working directory and reported DSHX version.",
                },
              ],
            },
          ],
        },
        {
          id: "manifest-repair",
          title: "Manifest repair plan API",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "createManifestRepairPlan(config, options?)",
                  type: "Promise<ManifestRepairPlan>",
                  body: "Reads package.json and returns deterministic file changes, diagnostics, changedFiles, and a reviewable diff without writing.",
                },
                {
                  name: "applyManifestRepairPlan(plan)",
                  type: "Promise<void>",
                  body: "Applies a reviewed error-free plan through the atomic file transaction.",
                },
                {
                  name: "rollbackManifestRepairPlan(plan)",
                  type: "Promise<void>",
                  body: "Restores the exact pre-plan file contents after a later failure.",
                },
                {
                  name: "DshxError",
                  type: "Error",
                  body: "Structured thrown failure with stable code plus optional file, hint, cause, and a formatted message.",
                },
              ],
            },
            {
              kind: "note",
              text: "These exports are available from @becomeopc/dshx. Planning is read-only; apply is the explicit write boundary.",
            },
          ],
        },
        {
          id: "no-shortcuts",
          title: "Contribution APIs do not imply generators",
          blocks: [
            {
              kind: "paragraph",
              text: "Prompt, Settings, typed API, and Conversation contracts are authored directly. DSHX does not currently add prompt, settings, API, or Conversation-specific generators or generic UI editors.",
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "配置、Compiler 与 CLI",
      eyebrow: "07 · API 参考",
      title: "配置、Compiler 与 CLI",
      intro:
        "使用项目 CLI 获得确定性构建与脚手架；绑定 Provider-owned Runtime contract 前，先检查真实运行的 DSH Composition。",
      description: "使用 dshx build、check、dev、inspect 与事务式 scaffold 命令。",
      sections: [
        {
          id: "configuration",
          title: "defineConfig(config) 与 resolveDshxConfig(options?)",
          blocks: [
            { kind: "code", title: "dshx.config.ts", code: configExample },
            {
              kind: "api",
              rows: [
                {
                  name: "defineConfig(config)",
                  type: "T",
                  body: "为 DshxConfig 提供上下文类型并保留原对象的 identity helper。",
                },
                {
                  name: "host / client",
                  type: "string | false",
                  body: "覆盖入口路径或禁用一侧；存在时默认 src/host.ts 与 src/client.tsx。",
                },
                { name: "profile", type: "string", body: "DSH Profile 名称，默认 web。" },
                {
                  name: "dev.hostRestart",
                  type: "'manual' | 'auto'",
                  body: "Host 重启策略，默认 manual。",
                },
                {
                  name: "build.sourcemap",
                  type: "boolean",
                  body: "生产/监听构建 sourcemap 开关，默认 true。",
                },
                {
                  name: "compatibility.allowUnsupported",
                  type: "boolean",
                  body: "继续使用 unsupported 兼容性的显式 opt-in，默认 false。",
                },
                {
                  name: "resolveDshxConfig({ cwd? })",
                  type: "Promise<ResolvedDshxConfig>",
                  body: "发现并规范化项目，不修改文件。",
                },
              ],
            },
          ],
        },
        {
          id: "commands",
          title: "项目命令",
          blocks: [
            {
              kind: "api",
              rows: [
                { name: "dshx dev", type: "开发", body: "构建、关联、监听，并在 DSH 中运行插件。" },
                {
                  name: "dshx build",
                  type: "生产",
                  body: "验证 Manifest，并输出所有启用的 Host 与 Client 产物。",
                },
                {
                  name: "dshx check",
                  type: "诊断",
                  body: "检查元数据、兼容性、Profile 关联、Provider package edge 与 Runtime Bridge 状态。",
                },
                {
                  name: "dshx inspect <kind>",
                  type: "实时 Runtime",
                  body: "从当前 DSH Composition 读取 adapter 支持的目标。protocol-1 当前可读取 Slot、Service 与 Event；Tool discovery 会返回明确的 unavailable 诊断。",
                },
              ],
            },
            {
              kind: "note",
              text: "check 与 inspect 默认只读；build 会写入声明的生产产物。check 只有显式 --fix 才修改项目元数据，因此先使用 --dry-run。支持时可加 --json 接入自动化。",
            },
          ],
        },
        {
          id: "inspect",
          title: "先 Inspect，再生成",
          blocks: [
            {
              kind: "paragraph",
              text: "Inspect 读取当前运行中的 Composition，不虚构离线目录。先发现 Provider 的准确 Slot contract，再基于 Runtime 证据生成代码。",
            },
            {
              kind: "terminal",
              lines: [
                { text: "dshx inspect slots", kind: "cmd" },
                { text: "sidebar.footer.action · list · @provider/plugin", kind: "accent" },
                { text: "dshx add ui --slot sidebar.footer.action --dry-run", kind: "cmd" },
                { text: "would create src/ui/sidebar-footer-action.tsx", kind: "ok" },
              ],
            },
          ],
        },
        {
          id: "scaffolds",
          title: "事务式源码脚手架",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "dshx add ui --slot <name>",
                  type: "Client",
                  body: "生成并注册类型化 React Slot 贡献。",
                },
                {
                  name: "dshx add tool --name <name>",
                  type: "Host",
                  body: "生成官方 Tool，并挂到 defineHost。",
                },
                {
                  name: "dshx add command --name <name>",
                  type: "Host",
                  body: "生成官方 Command，并挂到 defineHost。",
                },
                {
                  name: "dshx add hook --event <name>",
                  type: "Host",
                  body: "生成原生 Cordis Event Listener。",
                },
              ],
            },
            {
              kind: "paragraph",
              text: "脚手架会先规划全部源码修改再写入，并回滚部分写入；不会安装依赖，也不会修改 DSH Profile。",
            },
          ],
        },
        {
          id: "compiler",
          title: "buildHost(options) 与 buildClient(options)",
          blocks: [
            {
              kind: "paragraph",
              text: "只有嵌入 Compiler 时才直接使用 @becomeopc/dshx/compiler。普通项目使用 dshx build/dev，以同时执行 config、Manifest、兼容性与 Profile 检查。",
            },
            { kind: "code", title: "程序化 Compiler", code: compilerSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "packageId",
                  type: "string · 必填",
                  body: "两个 Compiler 使用的发布包 identity。",
                },
                {
                  name: "entry",
                  type: "string",
                  body: "Client 必填；Host 可选，省略时输出空 Host module。",
                },
                { name: "outDir", type: "string · 必填", body: "产物输出目录。" },
                {
                  name: "root / logicalName",
                  type: "string",
                  body: "可选项目根目录与 Runtime 可见逻辑名称。",
                },
                {
                  name: "sourcemap / watch",
                  type: "boolean",
                  body: "启用 sourcemap，或返回活动 watcher build。",
                },
                {
                  name: "external",
                  type: "readonly string[] · Client",
                  body: "额外 Client external。",
                },
                {
                  name: "inject",
                  type: "readonly string[] · Client",
                  body: "来自 dsh.client.inject 的 Manifest package edge，用于能力诊断。",
                },
                {
                  name: "compatibility",
                  type: "DshCompatibility",
                  body: "已解析 adapter contract；只有 Compiler 显式提供处才使用默认值。",
                },
              ],
            },
          ],
        },
        {
          id: "programmatic-cli",
          title: "parseCliArgs() 与 runCli()",
          blocks: [
            { kind: "code", title: "嵌入 CLI", code: cliSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "parseCliArgs(argv)",
                  type: "CliArgs",
                  body: "只解析参数，不执行命令；无效组合抛出 CliUsageError。",
                },
                {
                  name: "runCli(argv, options?)",
                  type: "Promise<number>",
                  body: "执行命令并返回 exit code，不直接退出进程。",
                },
                { name: "options.io", type: "CliIO", body: "可选 stdin/stdout/stderr stream。" },
                {
                  name: "options.runtime",
                  type: "CliRuntime",
                  body: "嵌入环境与测试使用的可选依赖覆盖。",
                },
                {
                  name: "options.cwd / version",
                  type: "string",
                  body: "默认工作目录与报告的 DSHX 版本。",
                },
              ],
            },
          ],
        },
        {
          id: "manifest-repair",
          title: "Manifest repair plan API",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "createManifestRepairPlan(config, options?)",
                  type: "Promise<ManifestRepairPlan>",
                  body: "读取 package.json，返回确定性文件改动、诊断、changedFiles 与可审阅 diff，不写文件。",
                },
                {
                  name: "applyManifestRepairPlan(plan)",
                  type: "Promise<void>",
                  body: "通过原子文件事务应用已审阅且无 error 的 plan。",
                },
                {
                  name: "rollbackManifestRepairPlan(plan)",
                  type: "Promise<void>",
                  body: "后续步骤失败时恢复 plan 前的准确文件内容。",
                },
                {
                  name: "DshxError",
                  type: "Error",
                  body: "带稳定 code、可选 file/hint/cause 与格式化 message 的结构化抛出错误。",
                },
              ],
            },
            {
              kind: "note",
              text: "这些 export 来自 @becomeopc/dshx。创建 plan 只读；apply 是显式写入边界。",
            },
          ],
        },
        {
          id: "no-shortcuts",
          title: "存在贡献 API 不等于必须提供 generator",
          blocks: [
            {
              kind: "paragraph",
              text: "Prompt、Settings、类型化 API 与 Conversation contract 目前直接编写。DSHX 不增加 prompt、settings、API、Conversation 专用 generator 或通用 UI 编辑器。",
            },
          ],
        },
      ],
    },
  },
});
