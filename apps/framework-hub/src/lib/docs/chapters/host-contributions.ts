import { defineDocsChapter } from "../types";

const signature = `interface HostDefinition {
  name?: string
  inject?: readonly string[]
  tools?: readonly ToolDefinition[]
  commands?: readonly CommandDefinition[]
  prompts?: readonly PromptContribution[]
  settings?: readonly SettingsContribution[]
  apis?: readonly ApiHostRegistration[]
  setup?: (ctx: Context) => void | Promise<void>
}

function defineHost<const T extends HostDefinition>(
  definition: T & Record<Exclude<keyof T, keyof HostDefinition>, never>,
): T`;

const helperExample = `const status = defineTool({
  name: 'status',
  description: 'Read the plugin status',
  parameters: {},
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute() { return 'ready' },
})

const reset = defineCommand({
  name: 'reset-status',
  description: 'Reset plugin status',
  handler() { return { kind: 'success', text: 'reset' } },
})`;

const promptExample = `const guidance = definePromptSection({
  name: 'plugin:status-guidance',
  order: 150,
  text: 'Use the status tool for runtime questions.',
})
// Opaque contribution; the official section object keeps its identity.

const runtime = definePromptContext({
  name: 'plugin:status-runtime',
  order: 0,
  text: () => 'Status provider is ready.',
})
// Opaque contribution; text is evaluated by the official assembler.`;

const fullExample = `import {
  defineCommand,
  defineHost,
  definePromptContext,
  definePromptSection,
  defineTool,
} from '@becomeopc/dshx/host'
import { runtimeSettings } from './settings'
import { statusApi } from './api/status'

// status, reset, guidance and runtime are defined above.
export default defineHost({
  name: 'status-host',
  tools: [status],
  commands: [reset],
  prompts: [guidance, runtime],
  settings: [runtimeSettings],
  apis: [statusApi.host({
    read: async ({ ctx, signal }) => {
      signal.throwIfAborted()
      return ctx.status.read()
    },
  })],
  setup(ctx) {
    ctx.effect(() => {
      const timer = setInterval(() => ctx.status.refresh(), 30_000)
      return () => clearInterval(timer)
    })
  },
})`;

const enFields = [
  { name: "name", type: "string | undefined", body: "Optional logical plugin name." },
  {
    name: "inject",
    type: "readonly string[]",
    body: "Extra Cordis services used by setup. Merged with generated injects and deduplicated.",
  },
  {
    name: "tools",
    type: "readonly ToolDefinition[]",
    body: "Official Tool definitions, normally created with defineTool().",
  },
  {
    name: "commands",
    type: "readonly CommandDefinition[]",
    body: "Official Command definitions, normally created with defineCommand().",
  },
  {
    name: "prompts",
    type: "readonly PromptContribution[]",
    body: "Section/context wrappers created by the Prompt helpers.",
  },
  {
    name: "settings",
    type: "readonly SettingsContribution[]",
    body: "Settings contracts or Host facets. Each entry claims one namespace.",
  },
  {
    name: "apis",
    type: "readonly ApiHostRegistration[]",
    body: "Typed API implementations created with contract.host(). HostDefinition.api has been removed.",
  },
  {
    name: "setup",
    type: "(ctx: Context) => void | Promise<void>",
    body: "Runs after every declared contribution has registered.",
  },
] as const;

const zhFields = [
  { name: "name", type: "string | undefined", body: "可选的逻辑插件名。" },
  {
    name: "inject",
    type: "readonly string[]",
    body: "setup 额外依赖的 Cordis Service；与自动 inject 合并并去重。",
  },
  {
    name: "tools",
    type: "readonly ToolDefinition[]",
    body: "官方 Tool 定义，通常由 defineTool() 创建。",
  },
  {
    name: "commands",
    type: "readonly CommandDefinition[]",
    body: "官方 Command 定义，通常由 defineCommand() 创建。",
  },
  {
    name: "prompts",
    type: "readonly PromptContribution[]",
    body: "Prompt helper 创建的 Section / Context wrapper。",
  },
  {
    name: "settings",
    type: "readonly SettingsContribution[]",
    body: "Settings contract 或 Host facet；每项声明一个 namespace。",
  },
  {
    name: "apis",
    type: "readonly ApiHostRegistration[]",
    body: "contract.host() 创建的类型化 API 实现。HostDefinition.api 已删除。",
  },
  {
    name: "setup",
    type: "(ctx: Context) => void | Promise<void>",
    body: "所有声明式贡献注册完成后执行。",
  },
] as const;

export const hostContributions = defineDocsChapter({
  slug: "host-contributions",
  group: "contributions",
  copy: {
    en: {
      navigation: "Host API",
      eyebrow: "04 · API Candidate",
      title: "Host API",
      intro:
        "Use @becomeopc/dshx/host to declare the Node-side module and register official contributions.",
      description:
        "Reference for defineHost, defineTool, defineCommand, definePromptSection, and definePromptContext.",
      sections: [
        {
          id: "definition",
          label: "@becomeopc/dshx/host",
          title: "defineHost(definition)",
          blocks: [
            {
              kind: "paragraph",
              text: "Defines the default Host export. It returns the same object and rejects unknown top-level keys at type-check time.",
            },
            { kind: "code", title: "Signature", code: signature },
            { kind: "api", rows: enFields },
            { kind: "code", title: "src/host.ts", code: fullExample },
          ],
        },
        {
          id: "tool-command",
          title: "defineTool() and defineCommand()",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "defineTool(definition)",
                  type: "T",
                  body: "Re-export of the official @deepseek-ai/dsh-tools helper. Returns the typed Tool definition.",
                },
                {
                  name: "defineCommand(definition)",
                  type: "T",
                  body: "Identity helper for CommandDefinition. Preserves literal names and handler types.",
                },
              ],
            },
            { kind: "code", title: "Tool and Command", code: helperExample },
            {
              kind: "note",
              text: "Tool schemas, execution, rendering, Command invocation/results, duplicates, and disposal keep official DSH behavior.",
            },
          ],
        },
        {
          id: "prompts",
          title: "definePromptSection() and definePromptContext()",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "definePromptSection(section)",
                  type: "PromptSectionContribution<T>",
                  body: "Returns an opaque contribution while preserving the official PromptSection object identity and literal type internally.",
                },
                {
                  name: "definePromptContext(context)",
                  type: "PromptContextContribution<T>",
                  body: "Returns an opaque contribution. text may be static or an official dynamic provider.",
                },
              ],
            },
            { kind: "code", title: "Prompt contributions", code: promptExample },
            {
              kind: "paragraph",
              text: "The discriminator only selects ctx.systemPrompt.section() or .context(). Naming, order, duplicate checks, scoped shadowing, assembly, dynamic evaluation, completion, and disposal belong to the official service.",
            },
          ],
        },
        {
          id: "order",
          title: "Registration order and automatic injects",
          blocks: [
            {
              kind: "api",
              rows: [
                { name: "1", type: "Tools", body: "Non-empty tools adds tools." },
                { name: "2", type: "Commands", body: "Non-empty commands adds commands." },
                { name: "3", type: "Prompts", body: "Non-empty prompts adds systemPrompt." },
                { name: "4", type: "Settings", body: "Non-empty settings adds settings." },
                { name: "5", type: "APIs", body: "Non-empty apis adds connection." },
                { name: "6", type: "setup(ctx)", body: "Runs last. Empty arrays add nothing." },
              ],
            },
            {
              kind: "paragraph",
              text: "Array order is preserved, including equal official order values. Explicit and generated inject names are deduplicated.",
            },
          ],
        },
        {
          id: "lifecycle",
          title: "Lifecycle and errors",
          blocks: [
            {
              kind: "list",
              items: [
                "Malformed Host definitions or Prompt wrappers fail with a Host definition diagnostic.",
                "Official duplicate, schema, validation, and service errors are not replaced by DSHX rules.",
                "The owning Cordis Fiber disposes contributions; DSHX does not call their disposers directly.",
                "Use ctx.effect() or an official service lifecycle for cleanup started in setup(ctx).",
              ],
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "Host API",
      eyebrow: "04 · API Candidate",
      title: "Host API",
      intro: "使用 @becomeopc/dshx/host 声明 Node 侧模块并注册官方贡献。",
      description:
        "defineHost、defineTool、defineCommand、definePromptSection 与 definePromptContext 参考。",
      sections: [
        {
          id: "definition",
          label: "@becomeopc/dshx/host",
          title: "defineHost(definition)",
          blocks: [
            {
              kind: "paragraph",
              text: "定义默认 Host export。返回传入的同一个对象，并在类型检查时拒绝未知顶层字段。",
            },
            { kind: "code", title: "函数签名", code: signature },
            { kind: "api", rows: zhFields },
            { kind: "code", title: "src/host.ts", code: fullExample },
          ],
        },
        {
          id: "tool-command",
          title: "defineTool() 与 defineCommand()",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "defineTool(definition)",
                  type: "T",
                  body: "官方 @deepseek-ai/dsh-tools helper 的转出；返回类型化 Tool 定义。",
                },
                {
                  name: "defineCommand(definition)",
                  type: "T",
                  body: "CommandDefinition 的 identity helper；保留字面量 name 和 handler 类型。",
                },
              ],
            },
            { kind: "code", title: "Tool 与 Command", code: helperExample },
            {
              kind: "note",
              text: "Tool schema、执行、渲染、Command invocation/result、duplicate 与 dispose 均保持官方 DSH 行为。",
            },
          ],
        },
        {
          id: "prompts",
          title: "definePromptSection() 与 definePromptContext()",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "definePromptSection(section)",
                  type: "PromptSectionContribution<T>",
                  body: "返回 opaque 贡献，内部保留官方 PromptSection 对象身份与字面量类型。",
                },
                {
                  name: "definePromptContext(context)",
                  type: "PromptContextContribution<T>",
                  body: "返回 opaque 贡献；text 可以是静态文本或官方动态 provider。",
                },
              ],
            },
            { kind: "code", title: "Prompt 贡献", code: promptExample },
            {
              kind: "paragraph",
              text: "discriminator 只选择 ctx.systemPrompt.section() 或 .context()。name、order、duplicate、作用域 shadow、assembly、动态求值、complete 与 dispose 均由官方 Service 管理。",
            },
          ],
        },
        {
          id: "order",
          title: "注册顺序与自动 inject",
          blocks: [
            {
              kind: "api",
              rows: [
                { name: "1", type: "Tools", body: "tools 非空时追加 tools。" },
                { name: "2", type: "Commands", body: "commands 非空时追加 commands。" },
                { name: "3", type: "Prompts", body: "prompts 非空时追加 systemPrompt。" },
                { name: "4", type: "Settings", body: "settings 非空时追加 settings。" },
                { name: "5", type: "APIs", body: "apis 非空时追加 connection。" },
                { name: "6", type: "setup(ctx)", body: "最后执行；空数组不追加 inject。" },
              ],
            },
            {
              kind: "paragraph",
              text: "保持数组声明顺序，包括官方 order 相同的贡献。显式和自动生成的 inject 会去重。",
            },
          ],
        },
        {
          id: "lifecycle",
          title: "生命周期与错误",
          blocks: [
            {
              kind: "list",
              items: [
                "错误的 Host definition 或 Prompt wrapper 会产生 Host definition 诊断。",
                "官方 duplicate、schema、validation 与 Service 错误不会被替换成 DSHX 规则。",
                "贡献由所属 Cordis Fiber dispose；DSHX 不直接调用 disposer。",
                "setup(ctx) 中启动的工作使用 ctx.effect() 或官方 Service 生命周期登记清理。",
              ],
            },
          ],
        },
      ],
    },
  },
});
