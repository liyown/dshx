import { defineDocsChapter } from "../types";

const clientSignature = `interface ClientDefinition {
  readonly name?: string
  readonly inject?: readonly string[]
  readonly conversations?: readonly ConversationContribution[]
  readonly slots?: readonly SlotContribution[]
  readonly setup?: (ctx: Context) => void | Promise<void>
}

function defineClient<const T extends ClientDefinition>(definition: T): T`;

const slotSignature = `function defineSlot<
  K extends keyof SlotMap & string,
  EntryKey extends EntryKeyOf<K>,
  const O extends SlotOptions<K, EntryKey>,
>(name: K, options: O): SlotContribution<K, O, O['component']>

// SlotOptions includes component, children, store, inject,
// locale, registrant and provider-specific KindOptions.`;

const example = `import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { defineClient, defineSlot, useApiQuery } from '@becomeopc/dshx/client'
import { statusApi } from './api/status.js'

function Status() {
  const status = useApiQuery(statusApi, 'get', { enabled: true })
  return <span>{status.data?.project ?? 'Connecting…'}</span>
}

const statusSlot = defineSlot('sidebar.footer.action', {
  id: 'status.runtime',
  order: 0,
  component: Status,
})

export default defineClient({
  name: 'status-client',
  slots: [statusSlot],
})`;

export const projectModel = defineDocsChapter({
  slug: "project-model",
  group: "start",
  copy: {
    en: {
      navigation: "Client API",
      eyebrow: "02 · API Candidate",
      title: "Client API",
      intro:
        "Define the browser module, register official Slot contributions, and consume shared API or Settings contracts from React components.",
      description:
        "Signatures, registration order, Slot options, automatic Hook wiring, and Client lifecycle.",
      sections: [
        {
          id: "client",
          label: "@becomeopc/dshx/client",
          title: "defineClient(definition)",
          blocks: [
            { kind: "code", title: "Signature", code: clientSignature },
            {
              kind: "api",
              rows: [
                { name: "name", type: "string", body: "Optional logical Client plugin name." },
                {
                  name: "inject",
                  type: "readonly string[]",
                  body: "Additional Cordis services used by setup or direct official integration. Generated injects are deduplicated against this array.",
                },
                {
                  name: "conversations",
                  type: "readonly ConversationContribution[]",
                  body: "Experimental integrated lifecycle-and-renderer contributions created with defineConversation().render().",
                },
                {
                  name: "slots",
                  type: "readonly SlotContribution[]",
                  body: "Opaque official Slot contributions returned by defineSlot().",
                },
                {
                  name: "setup",
                  type: "(ctx: Context) => void | Promise<void>",
                  body: "Runs after Conversations and Slots register. Register cleanup through the official Cordis lifecycle.",
                },
              ],
            },
            {
              kind: "note",
              text: "ClientDefinition has no api, apis, or settings field. Retained useApi, useApiQuery, and useSettings calls declare those Client capabilities.",
            },
          ],
        },
        {
          id: "slot",
          title: "defineSlot(name, options)",
          blocks: [
            { kind: "code", title: "Signature", code: slotSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "name",
                  type: "keyof SlotMap",
                  body: "Official Slot name. Import the provider's client declaration so it can augment SlotMap.",
                },
                {
                  name: "component",
                  type: "SlotComponent<ComposedProps<...>>",
                  body: "Receives provider props, normalized HandleOf<StoreDecl>, injected props, session/maybe state, locale, and declared child render functions.",
                },
                {
                  name: "children / store / inject",
                  type: "official Slot declarations",
                  body: "Declare child Slots, bind a provider store, and map registration inputs into extra component props. RendersCheck rejects declared children that are never exposed to the component.",
                },
                {
                  name: "KindOptions",
                  type: "keyed | list | chain options",
                  body: "Provider-specific id, key, order, session, maybe, chain, and related fields are inferred from the selected Slot.",
                },
                {
                  name: "return",
                  type: "SlotContribution",
                  body: "Opaque contribution. DSHX does not expose an internal marker or registration record.",
                },
              ],
            },
            { kind: "code", title: "src/client.tsx", code: example },
          ],
        },
        {
          id: "automatic-wiring",
          title: "Hook-driven capability inference",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "useApi / useApiQuery",
                  type: "connection inject",
                  body: "A Hook retained in the final module metadata adds the official connection inject and validates the dsh-client-connection package edge.",
                },
                {
                  name: "useSettings",
                  type: "settingsScope inject",
                  body: "A retained Hook adds settingsScope and validates the dsh-client-ui-settings package edge.",
                },
                {
                  name: "tree-shaken Hook",
                  type: "no capability",
                  body: "An import or call removed from the final bundle adds no inject. DSHX does not scan marker strings in generated JavaScript.",
                },
              ],
            },
            {
              kind: "paragraph",
              text: "Client registration order is Conversations, Slots, then setup(ctx). Official Client Fiber disposal owns bindings, scopes, Slot registrations, and HMR cleanup.",
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "Client API",
      eyebrow: "02 · API Candidate",
      title: "Client API",
      intro:
        "定义浏览器模块、注册官方 Slot 贡献，并在 React Component 中消费共享 API 或 Settings contract。",
      description:
        "defineClient/defineSlot 签名、注册顺序、Slot 选项、Hook 自动接线与 Client 生命周期。",
      sections: [
        {
          id: "client",
          label: "@becomeopc/dshx/client",
          title: "defineClient(definition)",
          blocks: [
            { kind: "code", title: "签名", code: clientSignature },
            {
              kind: "api",
              rows: [
                { name: "name", type: "string", body: "可选的逻辑 Client 插件名。" },
                {
                  name: "inject",
                  type: "readonly string[]",
                  body: "setup 或直接官方集成需要的额外 Cordis Service；与自动 inject 去重。",
                },
                {
                  name: "conversations",
                  type: "readonly ConversationContribution[]",
                  body: "defineConversation().render() 生成的 Experimental 生命周期与 renderer 整合贡献。",
                },
                {
                  name: "slots",
                  type: "readonly SlotContribution[]",
                  body: "defineSlot() 返回的 opaque 官方 Slot 贡献。",
                },
                {
                  name: "setup",
                  type: "(ctx: Context) => void | Promise<void>",
                  body: "Conversation 和 Slot 注册后执行；通过官方 Cordis 生命周期登记清理。",
                },
              ],
            },
            {
              kind: "note",
              text: "ClientDefinition 没有 api、apis 或 settings 字段。最终产物中保留的 useApi、useApiQuery 和 useSettings 调用就是 Client 能力声明。",
            },
          ],
        },
        {
          id: "slot",
          title: "defineSlot(name, options)",
          blocks: [
            { kind: "code", title: "签名", code: slotSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "name",
                  type: "keyof SlotMap",
                  body: "官方 Slot 名；导入 Provider 的 client declaration，让它扩展 SlotMap。",
                },
                {
                  name: "component",
                  type: "SlotComponent<ComposedProps<...>>",
                  body: "接收 Provider props、标准化 HandleOf<StoreDecl>、inject props、session/maybe 状态、locale 与 child render 函数。",
                },
                {
                  name: "children / store / inject",
                  type: "官方 Slot 声明",
                  body: "声明 child Slot、绑定 Provider store，并把注册输入映射为额外 component props。RendersCheck 会拒绝声明却不暴露给 component 的 children。",
                },
                {
                  name: "KindOptions",
                  type: "keyed | list | chain 选项",
                  body: "id、key、order、session、maybe、chain 等字段由选中的 Slot 推断。",
                },
                {
                  name: "return",
                  type: "SlotContribution",
                  body: "Opaque 贡献；不暴露内部 marker 或 registration record。",
                },
              ],
            },
            { kind: "code", title: "src/client.tsx", code: example },
          ],
        },
        {
          id: "automatic-wiring",
          title: "Hook 驱动的能力推断",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "useApi / useApiQuery",
                  type: "connection inject",
                  body: "最终 module metadata 中保留的 Hook 会追加官方 connection inject，并验证 dsh-client-connection package edge。",
                },
                {
                  name: "useSettings",
                  type: "settingsScope inject",
                  body: "保留的 Hook 会追加 settingsScope，并验证 dsh-client-ui-settings package edge。",
                },
                {
                  name: "tree-shaken Hook",
                  type: "无能力",
                  body: "被最终 bundle 移除的 import 或调用不追加 inject；DSHX 不扫描生成 JavaScript 中的 marker string。",
                },
              ],
            },
            {
              kind: "paragraph",
              text: "Client 注册顺序是 Conversations → Slots → setup(ctx)。官方 Client Fiber dispose 负责 binding、scope、Slot registration 和 HMR 清理。",
            },
          ],
        },
      ],
    },
  },
});
