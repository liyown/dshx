import { defineDocsChapter } from "../types";

const clientSignature = `interface ClientDefinition {
  name?: string
  inject?: readonly string[]
  slots?: readonly SlotContribution[]
  conversations?: readonly ClientConversationContribution[]
  api?: ApiContract
  apis?: readonly ApiContract[]
  setup?: (ctx: Context) => void | Promise<void>
}

function defineClient<const T extends ClientDefinition>(
  definition: T & Record<Exclude<keyof T, keyof ClientDefinition>, never>,
): T`;

const slotSignature = `function defineSlot<
  K extends keyof SlotMap & string,
  const O extends DshxSlotOptions<K>,
>(name: K, options: O): SlotContribution<K, O>

// DshxSlotOptions<K> combines the provider's component props,
// children, store, inject, locale, registrant, and KindOptions<K>.`;

const clientExample = `import type {} from '@provider/plugin/client'
import { defineClient, defineSlot } from '@becomeopc/dshx/client'
import { Status } from './ui/status'

const statusSlot = defineSlot('sidebar.footer.action', {
  component: Status,
  registrant: 'status-plugin',
})

export default defineClient({
  name: 'status-client',
  slots: [statusSlot],
})`;

const hookExample = `import { useApi, useQuery, useSettings } from '@becomeopc/dshx/client'
import { statusApi } from './api/status'
import { runtimeSettings } from './settings'

function Status() {
  const settings = useSettings(runtimeSettings)
  const api = useApi(statusApi)
  const status = useQuery(statusApi, 'read')

  // The retained hooks add settingsScope and connection automatically.
  // No ClientDefinition.settings field exists.
}`;

export const projectModel = defineDocsChapter({
  slug: "project-model",
  group: "start",
  copy: {
    en: {
      navigation: "Client API",
      eyebrow: "02 · API reference",
      title: "Client API",
      intro:
        "Use @becomeopc/dshx/client to register React Slot and Conversation contributions and consume shared contracts through Hooks.",
      description:
        "Reference for defineClient, defineSlot, automatic Hook wiring, and Client runtime boundaries.",
      sections: [
        {
          id: "client",
          label: "@becomeopc/dshx/client",
          title: "defineClient(definition)",
          blocks: [
            {
              kind: "paragraph",
              text: "Defines the default browser-side export. It returns the same definition and rejects unknown top-level fields at type-check time.",
            },
            { kind: "code", title: "Signature", code: clientSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "name",
                  type: "string | undefined",
                  body: "Optional logical Client plugin name.",
                },
                {
                  name: "inject",
                  type: "readonly string[]",
                  body: "Extra Cordis services needed by setup or manually integrated code.",
                },
                {
                  name: "slots",
                  type: "readonly SlotContribution[]",
                  body: "Contributions returned by defineSlot().",
                },
                {
                  name: "conversations",
                  type: "readonly ClientConversationContribution[]",
                  body: "Contributions returned by defineConversation(...).component(...).",
                },
                {
                  name: "api / apis",
                  type: "ApiContract | ApiContract[]",
                  body: "Eager API binding kept for compatibility. Prefer Hook-driven inference.",
                },
                {
                  name: "setup",
                  type: "(ctx: Context) => void | Promise<void>",
                  body: "Optional non-React setup with the native Client Cordis Context.",
                },
              ],
            },
            {
              kind: "note",
              text: "ClientDefinition has no settings field. Calling useSettings(contract) is the Client capability declaration.",
            },
          ],
        },
        {
          id: "slot",
          title: "defineSlot(name, options)",
          blocks: [
            {
              kind: "paragraph",
              text: "Creates one declarative official Slot contribution. The Slot name selects the provider's SlotMap entry and contextually types component props plus kind-specific options.",
            },
            { kind: "code", title: "Signature", code: slotSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "name",
                  type: "keyof SlotMap",
                  body: "Official Slot name. Import the provider's client declaration so TypeScript can augment SlotMap.",
                },
                {
                  name: "component",
                  type: "SlotComponent<ComposedProps<...>>",
                  body: "React component receiving the fully composed official Slot props.",
                },
                {
                  name: "children",
                  type: "ChildrenDecl",
                  body: "Optional child Slot declarations supported by the selected provider Slot.",
                },
                {
                  name: "store",
                  type: "StoreDecl",
                  body: "Optional provider store declaration used to compose props.",
                },
                {
                  name: "inject",
                  type: "(...args) => object",
                  body: "Maps official registration inputs into additional component props.",
                },
                {
                  name: "locale",
                  type: "keyof LocaleNamespaceMap",
                  body: "Optional official locale namespace.",
                },
                {
                  name: "registrant",
                  type: "string",
                  body: "Optional official registrant identity.",
                },
                {
                  name: "KindOptions",
                  type: "provider-specific",
                  body: "Additional options inferred from the selected Slot kind, such as a keyed renderer key.",
                },
              ],
            },
            { kind: "code", title: "src/client.tsx", code: clientExample },
            {
              kind: "paragraph",
              text: "Return value: { name, options, component }. component is separated from registration options so the compiler can register and wrap it correctly.",
            },
          ],
        },
        {
          id: "automatic-wiring",
          title: "useSettings(), useApi(), and useQuery() wiring",
          blocks: [
            { kind: "code", title: "A Slot component", code: hookExample },
            {
              kind: "api",
              rows: [
                {
                  name: "useSettings",
                  type: "settingsScope",
                  body: "Adds and deduplicates settingsScope and validates the dsh-client-ui-settings manifest edge.",
                },
                {
                  name: "useApi / useQuery",
                  type: "connection",
                  body: "Adds and deduplicates connection and validates the dsh-client-connection manifest edge.",
                },
                {
                  name: "tree-shaken Hook",
                  type: "none",
                  body: "A Hook removed from the final bundle does not add an inject or package requirement.",
                },
              ],
            },
            {
              kind: "paragraph",
              text: "Analysis runs on the bundled output. Settings scopes and API clients are reused by contract identity inside the current Client Fiber and are released with that Fiber during HMR or disposal.",
            },
          ],
        },
        {
          id: "boundaries",
          title: "Where code should run",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "Host",
                  type: "Node · Cordis",
                  body: "Tools, Commands, Prompts, Settings ownership, API handlers, filesystem/network access, and direct official setup.",
                },
                {
                  name: "Client",
                  type: "Browser · React",
                  body: "Slots, Conversation renderers, Hooks, and browser UI behavior.",
                },
                {
                  name: "Shared",
                  type: "portable TypeScript",
                  body: "Settings and API contracts. Do not place Host base values, validators, handlers, or setup code here.",
                },
              ],
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "Client API",
      eyebrow: "02 · API 参考",
      title: "Client API",
      intro:
        "使用 @becomeopc/dshx/client 注册 React Slot 与 Conversation 贡献，并通过 Hook 消费共享 contract。",
      description: "defineClient、defineSlot、Hook 自动接线与 Client Runtime 边界参考。",
      sections: [
        {
          id: "client",
          label: "@becomeopc/dshx/client",
          title: "defineClient(definition)",
          blocks: [
            {
              kind: "paragraph",
              text: "定义浏览器侧默认 export。返回同一个 definition，并在类型检查时拒绝未知顶层字段。",
            },
            { kind: "code", title: "函数签名", code: clientSignature },
            {
              kind: "api",
              rows: [
                { name: "name", type: "string | undefined", body: "可选的逻辑 Client 插件名。" },
                {
                  name: "inject",
                  type: "readonly string[]",
                  body: "setup 或手动集成代码额外依赖的 Cordis Service。",
                },
                {
                  name: "slots",
                  type: "readonly SlotContribution[]",
                  body: "defineSlot() 返回的贡献。",
                },
                {
                  name: "conversations",
                  type: "readonly ClientConversationContribution[]",
                  body: "defineConversation(...).component(...) 返回的贡献。",
                },
                {
                  name: "api / apis",
                  type: "ApiContract | ApiContract[]",
                  body: "为兼容保留的 eager API binding；优先使用 Hook 推断。",
                },
                {
                  name: "setup",
                  type: "(ctx: Context) => void | Promise<void>",
                  body: "使用原生 Client Cordis Context 的可选非 React setup。",
                },
              ],
            },
            {
              kind: "note",
              text: "ClientDefinition 没有 settings 字段。调用 useSettings(contract) 就是 Client Settings 能力声明。",
            },
          ],
        },
        {
          id: "slot",
          title: "defineSlot(name, options)",
          blocks: [
            {
              kind: "paragraph",
              text: "创建一个声明式官方 Slot 贡献。Slot name 选择 Provider SlotMap 条目，并为 component props 与该 kind 的附加选项提供上下文类型。",
            },
            { kind: "code", title: "函数签名", code: slotSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "name",
                  type: "keyof SlotMap",
                  body: "官方 Slot 名称。导入 Provider client 声明以扩展 SlotMap。",
                },
                {
                  name: "component",
                  type: "SlotComponent<ComposedProps<...>>",
                  body: "接收完整官方组合 props 的 React 组件。",
                },
                {
                  name: "children",
                  type: "ChildrenDecl",
                  body: "所选 Provider Slot 支持的可选子 Slot 声明。",
                },
                {
                  name: "store",
                  type: "StoreDecl",
                  body: "用于组合 props 的可选 Provider store 声明。",
                },
                {
                  name: "inject",
                  type: "(...args) => object",
                  body: "把官方注册输入映射为额外 component props。",
                },
                {
                  name: "locale",
                  type: "keyof LocaleNamespaceMap",
                  body: "可选的官方 locale namespace。",
                },
                { name: "registrant", type: "string", body: "可选的官方 registrant identity。" },
                {
                  name: "KindOptions",
                  type: "Provider 专属",
                  body: "由 Slot kind 推断的附加选项，例如 keyed renderer 的 key。",
                },
              ],
            },
            { kind: "code", title: "src/client.tsx", code: clientExample },
            {
              kind: "paragraph",
              text: "返回值为 { name, options, component }。component 与注册选项分离，供 compiler 正确注册与包装。",
            },
          ],
        },
        {
          id: "automatic-wiring",
          title: "useSettings()、useApi() 与 useQuery() 接线",
          blocks: [
            { kind: "code", title: "Slot 组件", code: hookExample },
            {
              kind: "api",
              rows: [
                {
                  name: "useSettings",
                  type: "settingsScope",
                  body: "追加并去重 settingsScope，同时校验 dsh-client-ui-settings Manifest edge。",
                },
                {
                  name: "useApi / useQuery",
                  type: "connection",
                  body: "追加并去重 connection，同时校验 dsh-client-connection Manifest edge。",
                },
                {
                  name: "被 tree-shaking 的 Hook",
                  type: "无",
                  body: "未进入最终 bundle 的 Hook 不增加 inject 或包依赖。",
                },
              ],
            },
            {
              kind: "paragraph",
              text: "分析发生在 bundle 输出上。Settings scope 与 API client 在当前 Client Fiber 内按 contract identity 复用，并随 Fiber HMR 或 dispose 释放。",
            },
          ],
        },
        {
          id: "boundaries",
          title: "代码应该放在哪里",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "Host",
                  type: "Node · Cordis",
                  body: "Tool、Command、Prompt、Settings 所有权、API handler、文件/网络访问与官方 setup。",
                },
                {
                  name: "Client",
                  type: "Browser · React",
                  body: "Slot、Conversation renderer、Hook 与浏览器 UI 行为。",
                },
                {
                  name: "Shared",
                  type: "可移植 TypeScript",
                  body: "Settings 与 API contract；不要放 Host base、validator、handler 或 setup。",
                },
              ],
            },
          ],
        },
      ],
    },
  },
});
