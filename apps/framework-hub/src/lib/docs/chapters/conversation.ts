import { defineDocsChapter } from "../types";

const definitionSignature = `function defineConversation<
  const Kind extends string,
  const Events extends ConversationEventDescriptors,
>(definition: {
  kind: Kind
  events: {
    [Type in keyof SessionEventMap]?: {
      role: 'start' | 'update'
      id(event: SessionEvent<Type>): string
      publication?: 'none' | 'animation-frame' | 'immediate'
    }
  }
}): ConversationContract<Kind, Events>`;

const componentSignature = `contract.component<State, Data = State>({
  initial(input: ConversationInitialInput): State,
  reduce?(input: ConversationReduceInput): State,
  publication?(input): 'none' | 'animation-frame' | 'immediate' | undefined,
  locationData?(input): { turn, value } | { turn, step, value } | null,
  view?(input): { data: Data, anchorSeq?, location?, visibility? } | null,
  component: React.ComponentType<ConversationRendererProps<Kind, Data>>,
}): ConversationComponentContribution`;

const conversationExample = `import { defineClient, useApi } from '@becomeopc/dshx/client'
import { defineConversation } from '@becomeopc/dshx/conversation'
import { reviewActions } from './shared/review-api'

const reviewJob = defineConversation({
  kind: 'plugin:review-job',
  events: {
    'turn/start': { role: 'start', id: (event) => String(event.data.turn) },
    'turn/end': { role: 'update', id: (event) => String(event.data.turn) },
  },
}).component({
  initial: ({ event }) => ({ reviewId: String(event.data.turn), status: 'running' }),
  reduce: ({ state, event }) => ({ ...state, status: event.data.reason.kind }),
  view: ({ state }) => state === undefined ? null : { data: state },
  component: function ReviewJobView({ data }) {
    const actions = useApi(reviewActions)
    return (
      <button onClick={() => void actions.retry({ reviewId: data.reviewId })}>
        {data.status}: retry
      </button>
    )
  },
})

export default defineClient({ conversations: [reviewJob] })`;

export const conversation = defineDocsChapter({
  slug: "conversation",
  group: "contributions",
  copy: {
    en: {
      navigation: "Conversation API",
      eyebrow: "06 · Experimental API",
      title: "Conversation Component API",
      intro:
        "Define one official Session-event family, attach its deterministic fold and view projection, and render the result as one component contribution.",
      description:
        "Build experimental component-shaped DSHX Conversation contributions over the official DSH assembler.",
      sections: [
        {
          id: "component",
          label: "@becomeopc/dshx/conversation",
          title: "defineConversation(definition)",
          blocks: [
            {
              kind: "paragraph",
              text: "Defines one Conversation node family over official Session events. The returned contract is completed by calling .component(options).",
            },
            { kind: "code", title: "Signature", code: definitionSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "kind",
                  type: "non-empty string",
                  body: "Stable node kind. It also becomes the keyed conversation.chat.node renderer key.",
                },
                {
                  name: "events",
                  type: "non-empty descriptor map",
                  body: "Keys must exist in the official SessionEventMap and at least one descriptor must have role: start.",
                },
                {
                  name: "role",
                  type: "'start' | 'update'",
                  body: "A start event creates a node; an update event is folded into an existing node.",
                },
                {
                  name: "id(event)",
                  type: "string",
                  body: "Returns the stable instance id used to associate start and update events.",
                },
                {
                  name: "publication",
                  type: "Publication | undefined",
                  body: "Optional default publication mode for matches of this event type.",
                },
              ],
            },
          ],
        },
        {
          id: "component-options",
          title: "contract.component(options)",
          blocks: [
            { kind: "code", title: "Signature", code: componentSignature },
            { kind: "code", title: "src/client.tsx", code: conversationExample },
            {
              kind: "note",
              text: "Conversation Components are experimental. They are implemented for the current protocol-1 seams, but the published API remains open until the real-runtime lifecycle and vocabulary gates are complete.",
            },
          ],
        },
        {
          id: "lifecycle",
          title: "Lifecycle callbacks",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "events",
                  type: "definition field",
                  body: "Selects official events before lifecycle callbacks run.",
                },
                {
                  name: "initial",
                  type: "start event → state",
                  body: "Required. Receives context, typed start event/match, reader, and previous(kind); returns initial deterministic state.",
                },
                {
                  name: "reduce",
                  type: "state + update → state",
                  body: "Receives context, current state, typed update event, and match. Required when any update descriptor exists.",
                },
                {
                  name: "publication",
                  type: "match → publication | undefined",
                  body: "Optionally overrides the descriptor publication per match; undefined falls back to descriptor then immediate.",
                },
                {
                  name: "locationData",
                  type: "state + scope → projection | null",
                  body: "Publishes business data at turn or step scope. Turn projections must not include step; step projections must include it.",
                },
                {
                  name: "view",
                  type: "state → { data, anchorSeq?, location?, visibility? } | null",
                  body: "Projects renderer data and optional official node fields. Return null to omit the node; omit view to use defined State as data.",
                },
                {
                  name: "component",
                  type: "React Component",
                  body: "Receives data, typed node, useTurnData, locale, Session and global official Slot props. Hooks such as useApi/useSettings are allowed.",
                },
              ],
            },
          ],
        },
        {
          id: "return-value",
          title: "Return value and registration",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "kind",
                  type: "'conversation-component'",
                  body: "Client runtime discriminator.",
                },
                {
                  name: "contract",
                  type: "ConversationContract",
                  body: "The original kind/events contract.",
                },
                {
                  name: "definition",
                  type: "ConversationNodeDefinition<State>",
                  body: "Official assembler definition generated from the lifecycle callbacks.",
                },
                {
                  name: "renderer",
                  type: "conversation.chat.node contribution",
                  body: "Keyed official Chat Slot renderer generated from component.",
                },
              ],
            },
            {
              kind: "paragraph",
              text: "Add the contribution once to defineClient({ conversations: [...] }). DSHX registers definition before renderer and automatically adds conversationEvents plus slots injects.",
            },
          ],
        },
        {
          id: "ownership",
          title: "Official assembler ownership",
          blocks: [
            {
              kind: "paragraph",
              text: "DSH owns event matching execution, folding, replay, sequence ordering, publication, pagination, location, and disposal. React receives projected data; it is not a second reducer or Session runtime.",
            },
            {
              kind: "list",
              items: [
                "Optional publication controls official publication timing.",
                "For turn scope, locationData returns { turn, value }; for step scope it returns { turn, step, value }. DSHX supplies the contract key and active scope.",
                "Host interaction uses an ordinary defineApi/useApi contract—there is no Conversation-specific action bus.",
                "API results do not mutate assembled nodes; durable outcomes must return through the official Session log.",
              ],
            },
          ],
        },
        {
          id: "vocabulary",
          title: "Current event vocabulary boundary",
          blocks: [
            {
              kind: "paragraph",
              text: "At the verified protocol-1 boundaries, event keys must already exist in the official SessionEventMap. TypeScript declaration merging cannot register a durable event, and DSH does not yet expose an out-of-tree vocabulary seam.",
            },
            {
              kind: "note",
              text: "Custom durable events and Host emit helpers are intentionally not part of this API yet.",
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "Conversation API",
      eyebrow: "06 · 实验性 API",
      title: "Conversation Component API",
      intro:
        "定义一个官方 Session event family，附加确定性 fold 与 view projection，再以一个 Component Contribution 渲染结果。",
      description: "基于官方 DSH assembler 构建实验性的组件式 DSHX Conversation 贡献。",
      sections: [
        {
          id: "component",
          label: "@becomeopc/dshx/conversation",
          title: "defineConversation(definition)",
          blocks: [
            {
              kind: "paragraph",
              text: "基于官方 Session event 定义一个 Conversation node family；再调用返回 contract 的 .component(options) 完成贡献。",
            },
            { kind: "code", title: "函数签名", code: definitionSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "kind",
                  type: "非空 string",
                  body: "稳定 node kind，同时成为 keyed conversation.chat.node renderer key。",
                },
                {
                  name: "events",
                  type: "非空 descriptor map",
                  body: "key 必须存在于官方 SessionEventMap，且至少一个 descriptor 是 role: start。",
                },
                {
                  name: "role",
                  type: "'start' | 'update'",
                  body: "start event 创建 node；update event 折叠进已有 node。",
                },
                {
                  name: "id(event)",
                  type: "string",
                  body: "返回关联 start/update event 的稳定实例 id。",
                },
                {
                  name: "publication",
                  type: "Publication | undefined",
                  body: "该 event type match 的可选默认 publication mode。",
                },
              ],
            },
          ],
        },
        {
          id: "component-options",
          title: "contract.component(options)",
          blocks: [
            { kind: "code", title: "函数签名", code: componentSignature },
            { kind: "code", title: "src/client.tsx", code: conversationExample },
            {
              kind: "note",
              text: "Conversation Component 目前是 experimental：当前 protocol-1 seam 已实现，但真实 Runtime 生命周期与 vocabulary gate 完成前，公开 API 仍保持开放。",
            },
          ],
        },
        {
          id: "lifecycle",
          title: "生命周期回调",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "events",
                  type: "definition 字段",
                  body: "在生命周期回调执行前选择官方 event。",
                },
                {
                  name: "initial",
                  type: "start event → state",
                  body: "必填；接收 context、类型化 start event/match、reader 与 previous(kind)，返回初始确定性 state。",
                },
                {
                  name: "reduce",
                  type: "state + update → state",
                  body: "接收 context、当前 state、类型化 update event 与 match；存在任意 update descriptor 时必填。",
                },
                {
                  name: "publication",
                  type: "match → publication | undefined",
                  body: "按 match 覆盖 descriptor publication；undefined 回退到 descriptor，再回退到 immediate。",
                },
                {
                  name: "locationData",
                  type: "state + scope → projection | null",
                  body: "发布 turn 或 step scope 业务数据；turn projection 禁止 step，step projection 必须包含 step。",
                },
                {
                  name: "view",
                  type: "state → { data, anchorSeq?, location?, visibility? } | null",
                  body: "投影 renderer data 与可选官方 node 字段；返回 null 忽略 node；省略 view 时直接使用已定义 State。",
                },
                {
                  name: "component",
                  type: "React Component",
                  body: "接收 data、类型化 node、useTurnData、locale、Session 与 global 官方 Slot props；可使用 useApi/useSettings。",
                },
              ],
            },
          ],
        },
        {
          id: "return-value",
          title: "返回值与注册",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "kind",
                  type: "'conversation-component'",
                  body: "Client Runtime discriminator。",
                },
                {
                  name: "contract",
                  type: "ConversationContract",
                  body: "原始 kind/events contract。",
                },
                {
                  name: "definition",
                  type: "ConversationNodeDefinition<State>",
                  body: "由生命周期回调生成的官方 assembler definition。",
                },
                {
                  name: "renderer",
                  type: "conversation.chat.node contribution",
                  body: "由 component 生成的 keyed 官方 Chat Slot renderer。",
                },
              ],
            },
            {
              kind: "paragraph",
              text: "把贡献放入 defineClient({ conversations: [...] }) 一次。DSHX 先注册 definition，再注册 renderer，并自动追加 conversationEvents 与 slots inject。",
            },
          ],
        },
        {
          id: "ownership",
          title: "官方 assembler 所有权",
          blocks: [
            {
              kind: "paragraph",
              text: "event match 执行、fold、replay、sequence order、publication、pagination、location 与 dispose 都由 DSH 管理。React 只接收投影数据，不是第二个 reducer 或 Session Runtime。",
            },
            {
              kind: "list",
              items: [
                "可选 publication 控制官方 publication 时机。",
                "turn scope 的 locationData 返回 { turn, value }；step scope 返回 { turn, step, value }。contract key 与当前 scope 由 DSHX 提供。",
                "Host 交互使用普通 defineApi/useApi contract，不增加 Conversation action bus。",
                "API 结果不会修改 assembled node；持久化结果必须经官方 Session log 返回。",
              ],
            },
          ],
        },
        {
          id: "vocabulary",
          title: "当前 Event vocabulary 边界",
          blocks: [
            {
              kind: "paragraph",
              text: "在已验证的 protocol-1 边界，event key 必须已经存在于官方 SessionEventMap。TypeScript declaration merging 不能注册 durable event，DSH 也尚未暴露 out-of-tree vocabulary seam。",
            },
            {
              kind: "note",
              text: "自定义 durable event 与 Host emit helper 目前有意不进入 API。",
            },
          ],
        },
      ],
    },
  },
});
