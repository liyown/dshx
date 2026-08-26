import { defineDocsChapter } from "../types";

const example = `import { defineClient, useApi } from '@becomeopc/dshx/client'
import {
  defineConversation,
  type ConversationRenderProps,
} from '@becomeopc/dshx/experimental/conversation'
import { reviewApi } from './api/review.js'

const reviewLifecycle = defineConversation({
  kind: 'review-job',
  events: {
    'turn/start': { role: 'start', id: (event) => String(event.data.turn) },
    'turn/end': { role: 'update', id: (event) => String(event.data.turn) },
  },
  initial(_context, event) {
    return { turn: event.data.turn, status: 'running' as const }
  },
  reduce(state, _context, event) {
    return { ...state, status: event.data.reason.kind }
  },
  project(state) {
    return { label: 'Turn ' + state.turn, status: state.status }
  },
})

function ReviewNode({ data }: ConversationRenderProps<typeof reviewLifecycle>) {
  const api = useApi(reviewApi)
  return <button onClick={() => void api.retry({ turn: data.label })}>{data.status}</button>
}

const review = reviewLifecycle.render(ReviewNode)
export default defineClient({ conversations: [review] })`;

const signature = `defineConversation({
  kind,
  events,
  initial(context, startEvent) => state,
  reduce?(state, context, updateEvent) => nextState,
  project?(state, context) => rendererData,
}).render(RendererComponent): ConversationContribution`;

export const conversation = defineDocsChapter({
  slug: "conversation",
  group: "contributions",
  copy: {
    en: {
      navigation: "Conversation API",
      eyebrow: "08 · Experimental",
      title: "Conversation lifecycle component",
      intro:
        "Use pure lifecycle functions to fold official Session events, then render the projected data with a single React component contribution.",
      description:
        "Experimental defineConversation lifecycle, renderer props, registration, replay ownership, and Host interaction.",
      sections: [
        {
          id: "definition",
          label: "@becomeopc/dshx/experimental/conversation",
          title: "defineConversation(definition)",
          blocks: [
            { kind: "code", title: "Signature", code: signature },
            {
              kind: "api",
              rows: [
                {
                  name: "kind",
                  type: "non-empty string",
                  body: "Stable node kind and keyed conversation.chat.node renderer key.",
                },
                {
                  name: "events",
                  type: "ConversationEventDescriptors",
                  body: "Non-empty subset of the official SessionEventMap. At least one descriptor must use role: start.",
                },
                {
                  name: "role",
                  type: "start | update",
                  body: "A start event creates state; an update event folds into the matching instance.",
                },
                {
                  name: "id(event)",
                  type: "string",
                  body: "Stable instance id shared by related start and update events.",
                },
                {
                  name: "publication",
                  type: "official publication mode",
                  body: "Optional descriptor-level publication timing forwarded to the official assembler.",
                },
              ],
            },
          ],
        },
        {
          id: "lifecycle",
          title: "initial(), reduce(), and project()",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "initial(context, event)",
                  type: "State",
                  body: "Required pure initialization for a typed start event.",
                },
                {
                  name: "reduce(state, context, event)",
                  type: "State",
                  body: "Pure update fold. Required when update descriptors exist.",
                },
                {
                  name: "project(state, context)",
                  type: "Data",
                  body: "Optional pure renderer projection. When omitted, State is used as Data.",
                },
                {
                  name: "context",
                  type: "official ConversationNodeContext",
                  body: "Read-only assembler context. React Hooks are not valid inside lifecycle functions.",
                },
              ],
            },
            {
              kind: "note",
              text: "Lifecycle functions must remain deterministic for replay. Do not perform Host calls, mutate external state, or call React Hooks from them.",
            },
          ],
        },
        {
          id: "render",
          title: "lifecycle.render(Component)",
          blocks: [
            { kind: "code", title: "src/client.tsx", code: example },
            {
              kind: "api",
              rows: [
                {
                  name: "data",
                  type: "project return type",
                  body: "Projected Data, or State when project is omitted.",
                },
                {
                  name: "node / useTurnData",
                  type: "official Chat renderer props",
                  body: "Typed node plus the official turn-data reader.",
                },
                {
                  name: "session / global / locale",
                  type: "official Slot props",
                  body: "The same composed props supplied by conversation.chat.node.",
                },
                {
                  name: "ConversationRenderProps<typeof lifecycle>",
                  type: "renderer props",
                  body: "Types a separately declared renderer component without repeating Kind or Data.",
                },
                {
                  name: "return",
                  type: "ConversationContribution",
                  body: "One opaque contribution that registers the official definition before its keyed renderer.",
                },
              ],
            },
          ],
        },
        {
          id: "ownership",
          title: "Runtime ownership and limits",
          blocks: [
            {
              kind: "list",
              items: [
                "DSH owns matching, replay, ordering, folding, publication, pagination, location, HMR cleanup, reconnect, and disposal.",
                "Renderer components may call useApi, useApiQuery, and useSettings. Host interaction uses an ordinary typed API.",
                "Only official SessionEventMap events and the chat target are supported.",
                "DSHX does not add durable events, an event bus, an emit shortcut, or a Conversation-specific Host channel.",
              ],
            },
            {
              kind: "note",
              text: "This entry remains Experimental. It has no compatibility alias for the removed Conversation Node plus Slot or .component() APIs.",
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "Conversation API",
      eyebrow: "08 · Experimental",
      title: "Conversation 生命周期组件",
      intro:
        "先用纯生命周期函数 fold 官方 Session event，再由单个 React Component Contribution 渲染投影数据。",
      description:
        "Experimental defineConversation 生命周期、renderer props、注册、replay 所有权与 Host 交互。",
      sections: [
        {
          id: "definition",
          label: "@becomeopc/dshx/experimental/conversation",
          title: "defineConversation(definition)",
          blocks: [
            { kind: "code", title: "签名", code: signature },
            {
              kind: "api",
              rows: [
                {
                  name: "kind",
                  type: "非空 string",
                  body: "稳定 node kind，也是 keyed conversation.chat.node renderer key。",
                },
                {
                  name: "events",
                  type: "ConversationEventDescriptors",
                  body: "官方 SessionEventMap 的非空子集；至少一个 descriptor 必须是 role: start。",
                },
                {
                  name: "role",
                  type: "start | update",
                  body: "start event 创建 state；update event fold 到匹配实例。",
                },
                {
                  name: "id(event)",
                  type: "string",
                  body: "关联 start 和 update event 的稳定实例 id。",
                },
                {
                  name: "publication",
                  type: "官方 publication mode",
                  body: "透传给官方 assembler 的可选 descriptor publication 时机。",
                },
              ],
            },
          ],
        },
        {
          id: "lifecycle",
          title: "initial()、reduce() 与 project()",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "initial(context, event)",
                  type: "State",
                  body: "对类型化 start event 执行必填、纯初始化。",
                },
                {
                  name: "reduce(state, context, event)",
                  type: "State",
                  body: "纯 update fold；存在 update descriptor 时必填。",
                },
                {
                  name: "project(state, context)",
                  type: "Data",
                  body: "可选纯 renderer projection；省略时以 State 作为 Data。",
                },
                {
                  name: "context",
                  type: "官方 ConversationNodeContext",
                  body: "只读 assembler context；生命周期函数中不能使用 React Hook。",
                },
              ],
            },
            {
              kind: "note",
              text: "生命周期函数必须对 replay 保持确定性；不在其中调用 Host、修改外部状态或调用 React Hook。",
            },
          ],
        },
        {
          id: "render",
          title: "lifecycle.render(Component)",
          blocks: [
            { kind: "code", title: "src/client.tsx", code: example },
            {
              kind: "api",
              rows: [
                {
                  name: "data",
                  type: "project 返回类型",
                  body: "投影后 Data；省略 project 时是 State。",
                },
                {
                  name: "node / useTurnData",
                  type: "官方 Chat renderer props",
                  body: "类型化 node 与官方 turn-data reader。",
                },
                {
                  name: "session / global / locale",
                  type: "官方 Slot props",
                  body: "conversation.chat.node 供给的同一组 composed props。",
                },
                {
                  name: "ConversationRenderProps<typeof lifecycle>",
                  type: "renderer props",
                  body: "为单独声明的 renderer 类型化，无需重复 Kind 或 Data。",
                },
                {
                  name: "return",
                  type: "ConversationContribution",
                  body: "先注册官方 definition、再注册 keyed renderer 的单一 opaque 贡献。",
                },
              ],
            },
          ],
        },
        {
          id: "ownership",
          title: "Runtime 所有权与限制",
          blocks: [
            {
              kind: "list",
              items: [
                "matching、replay、ordering、folding、publication、pagination、location、HMR 清理、重连与 dispose 由 DSH 管理。",
                "Renderer Component 可以使用 useApi、useApiQuery 和 useSettings；Host 交互使用普通类型化 API。",
                "只支持官方 SessionEventMap event 和 chat target。",
                "DSHX 不增加 durable event、event bus、emit shortcut 或 Conversation 专用 Host channel。",
              ],
            },
            {
              kind: "note",
              text: "该入口仍为 Experimental；不为已删除的 Conversation Node + Slot 分离 API 或 .component() 提供兼容 alias。",
            },
          ],
        },
      ],
    },
  },
});
