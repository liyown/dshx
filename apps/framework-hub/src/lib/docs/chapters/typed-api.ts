import { defineDocsChapter } from "../types";

const contractSignature = `function method<I = void, O = unknown>(): ApiMethodDefinition<I, O>
function method<I, O>(options: {
  input?: StandardSchema<I>
  output?: StandardSchema<O>
}): ApiMethodDefinition<I, O>

function defineApi<
  const Methods extends Record<string, ApiMethodDefinition<any, any>>,
>(definition: {
  id: string
  version: number
  methods: Methods
}): ApiContract<Methods>`;

const hostSignature = `contract.host(
  handlers: {
    [Method in keyof Methods]: (args: {
      input: ApiInput<Methods[Method]>
      ctx: Context
      signal: AbortSignal
    }) => ApiOutput<Methods[Method]> | Promise<ApiOutput<Methods[Method]>>
  },
  options?: { authority?: 'loopback' | 'trusted-host' },
): ApiHostRegistration`;

const clientSignature = `const api = useApi(contract)
await api.method(input, { signal })
const result = await api.safe.method(input, { signal })
// { ok: true, value } | { ok: false, error: ApiError }

const query = useQuery(contract, 'method', input, { signal })
// { loading, data?, error?, retry() }`;

const apiExample = `// src/shared/status-api.ts
import { defineApi, method } from '@becomeopc/dshx/api'

export const statusApi = defineApi({
  id: 'status',
  version: 1,
  methods: {
    get: method<{ id: string }, { online: boolean }>(),
    refresh: method<void, { accepted: boolean }>(),
  },
})

// src/host.ts
import { defineHost } from '@becomeopc/dshx/host'
import { statusApi } from './shared/status-api'

export default defineHost({
  api: statusApi.host({
    async get({ input, signal }) {
      signal.throwIfAborted()
      return { online: input.id.length > 0 }
    },
    async refresh() { return { accepted: true } },
  }),
})

// src/client.tsx — inside a DSHX Slot component
import { useApi, useQuery } from '@becomeopc/dshx/client'
import { statusApi } from './shared/status-api'

function Status() {
  const status = useQuery(statusApi, 'get', { id: 'primary' })
  const api = useApi(statusApi)
  return (
    <button onClick={() => void api.refresh()}>
      {status.data?.online ? 'Online' : 'Refresh'}
    </button>
  )
}`;

export const typedApi = defineDocsChapter({
  slug: "typed-api",
  group: "contributions",
  copy: {
    en: {
      navigation: "Typed API",
      eyebrow: "05 · API reference",
      title: "Typed Host–Client API",
      intro:
        "Define transport methods once, implement them in the Host, and consume the inferred client from any DSHX Slot or Conversation component.",
      description:
        "Create typed unary DSHX Host–Client APIs and consume them with useApi or useQuery.",
      sections: [
        {
          id: "contract",
          label: "@becomeopc/dshx/api",
          title: "method() and defineApi()",
          blocks: [
            {
              kind: "paragraph",
              text: "method() declares one unary operation; defineApi() groups methods into a versioned transport contract shared by Host and Client.",
            },
            { kind: "code", title: "Signatures", code: contractSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "method<I, O>()",
                  type: "ApiMethodDefinition<I, O>",
                  body: "Declares TypeScript-only input/output types when runtime validation is not required.",
                },
                {
                  name: "method({ input, output })",
                  type: "ApiMethodDefinition<I, O>",
                  body: "Adds optional Standard Schema-compatible runtime validation for either direction.",
                },
                {
                  name: "id",
                  type: "string",
                  body: "Stable single segment matching letters, digits, dot, underscore, or hyphen; slash is rejected.",
                },
                {
                  name: "version",
                  type: "positive integer",
                  body: "Transport contract version. Zero, fractions, and negative values are rejected.",
                },
                {
                  name: "methods",
                  type: "Record<string, ApiMethodDefinition>",
                  body: "Named unary methods preserved with literal keys.",
                },
              ],
            },
            { kind: "code", title: "Shared API, Host, and Client", code: apiExample },
            {
              kind: "note",
              text: "Do not repeat the contract in defineClient. A retained useApi or useQuery call automatically adds the connection capability and validates the official provider package edge.",
            },
          ],
        },
        {
          id: "host",
          title: "contract.host(handlers, options?)",
          blocks: [
            { kind: "code", title: "Signature", code: hostSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "handlers",
                  type: "ApiHandlers<Methods>",
                  body: "Required implementation for every contract method. Missing handlers fail during registration construction.",
                },
                {
                  name: "input / ctx / signal",
                  type: "handler arguments",
                  body: "Validated input, native Host Cordis Context, and caller cancellation signal.",
                },
                {
                  name: "authority",
                  type: "'loopback' | 'trusted-host'",
                  body: "Defaults to loopback and is forwarded to official Connection registration.",
                },
              ],
            },
          ],
        },
        {
          id: "hooks",
          title: "useApi() and useQuery()",
          blocks: [
            { kind: "code", title: "Client calls", code: clientSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "useApi(contract)",
                  type: "ApiClient<Methods>",
                  body: "Returns imperative typed methods. Methods reject with ApiError.",
                },
                {
                  name: "api.safe.<method>()",
                  type: "Promise<ApiCallResult<O>>",
                  body: "Returns a discriminated result instead of throwing an ApiError.",
                },
                {
                  name: "useQuery(contract, method, input?, options?)",
                  type: "ApiQueryState<O>",
                  body: "Calls on mount/input change, aborts on cleanup, preserves prior data during reconnect, and exposes retry().",
                },
                {
                  name: "options.signal",
                  type: "AbortSignal",
                  body: "Cancels the Client call and propagates to the Host handler.",
                },
              ],
            },
          ],
        },
        {
          id: "transport",
          title: "ApiError and transport rules",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "transport",
                  type: "ApiError.kind",
                  body: "Request or response transport failed.",
                },
                {
                  name: "remote",
                  type: "ApiError.kind",
                  body: "Host handler returned an official remote failure; remoteCode may be present.",
                },
                {
                  name: "contract",
                  type: "ApiError.kind",
                  body: "Input/output validation or contract framing failed.",
                },
                {
                  name: "aborted",
                  type: "ApiError.kind",
                  body: "Caller or component lifecycle aborted the request.",
                },
                {
                  name: "unavailable",
                  type: "ApiError.kind",
                  body: "Connection/provider is unavailable.",
                },
              ],
            },
            {
              kind: "list",
              items: [
                "APIs are unary request/response calls over the official Client Connection service.",
                "JSON payloads are limited to 1 MiB.",
                "ApiError also exposes apiId, method, retryable, optional remoteCode, and cause.",
                "Connection loss is surfaced; DSHX does not invent an offline transport or queue writes.",
              ],
            },
          ],
        },
        {
          id: "advanced-runtime",
          title: "Advanced runtime exports",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "apiChannel(packageId, apiId)",
                  type: "string",
                  body: "Returns the stable hashed RPC channel used for one package contract.",
                },
                {
                  name: "registerApi(ctx, packageId, registration)",
                  type: "Promise<void>",
                  body: "Registers a Host implementation directly and attaches its disposer through ctx.effect(). defineHost normally calls this for you.",
                },
                {
                  name: "createApiClient(context, contract, packageId?)",
                  type: "ApiClient<Methods>",
                  body: "Creates a non-Hook typed client from a Cordis-like Context. React components should use useApi().",
                },
              ],
            },
          ],
        },
        {
          id: "responsibility",
          title: "Host interaction is not state assembly",
          blocks: [
            {
              kind: "paragraph",
              text: "Authorization, validation, revisions, idempotency, business cancellation, and durable outcomes belong in the Host. An API result does not mutate Settings or assembled Conversation data implicitly.",
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "类型化 API",
      eyebrow: "05 · API 参考",
      title: "类型化 Host–Client API",
      intro:
        "定义一次传输方法，在 Host 实现，然后从任意 DSHX Slot 或 Conversation Component 消费推导后的 Client。",
      description: "创建类型化一元 DSHX Host–Client API，并通过 useApi 或 useQuery 使用。",
      sections: [
        {
          id: "contract",
          label: "@becomeopc/dshx/api",
          title: "method() 与 defineApi()",
          blocks: [
            {
              kind: "paragraph",
              text: "method() 声明一个一元操作；defineApi() 把方法组成由 Host 与 Client 共享的版本化传输契约。",
            },
            { kind: "code", title: "函数签名", code: contractSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "method<I, O>()",
                  type: "ApiMethodDefinition<I, O>",
                  body: "不需要运行时校验时，只声明 TypeScript 输入输出类型。",
                },
                {
                  name: "method({ input, output })",
                  type: "ApiMethodDefinition<I, O>",
                  body: "为输入或输出增加可选的 Standard Schema 运行时校验。",
                },
                {
                  name: "id",
                  type: "string",
                  body: "稳定单段标识，只允许字母、数字、点、下划线与连字符；拒绝斜杠。",
                },
                { name: "version", type: "正整数", body: "传输契约版本；拒绝零、小数与负数。" },
                {
                  name: "methods",
                  type: "Record<string, ApiMethodDefinition>",
                  body: "保留字面量 key 的命名一元方法。",
                },
              ],
            },
            { kind: "code", title: "共享 API、Host 与 Client", code: apiExample },
            {
              kind: "note",
              text: "不要在 defineClient 重复 contract。实际保留 useApi 或 useQuery 会自动追加 connection 能力并验证官方 Provider package edge。",
            },
          ],
        },
        {
          id: "host",
          title: "contract.host(handlers, options?)",
          blocks: [
            { kind: "code", title: "函数签名", code: hostSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "handlers",
                  type: "ApiHandlers<Methods>",
                  body: "必须实现每个 contract method；缺少 handler 时在构造 registration 时失败。",
                },
                {
                  name: "input / ctx / signal",
                  type: "handler 参数",
                  body: "校验后的输入、原生 Host Cordis Context 与调用方取消信号。",
                },
                {
                  name: "authority",
                  type: "'loopback' | 'trusted-host'",
                  body: "默认 loopback，透传给官方 Connection 注册。",
                },
              ],
            },
          ],
        },
        {
          id: "hooks",
          title: "useApi() 与 useQuery()",
          blocks: [
            { kind: "code", title: "Client 调用", code: clientSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "useApi(contract)",
                  type: "ApiClient<Methods>",
                  body: "返回命令式类型化方法；失败时 reject ApiError。",
                },
                {
                  name: "api.safe.<method>()",
                  type: "Promise<ApiCallResult<O>>",
                  body: "返回 discriminated result，不抛出 ApiError。",
                },
                {
                  name: "useQuery(contract, method, input?, options?)",
                  type: "ApiQueryState<O>",
                  body: "挂载/输入变化时调用，清理时 abort，重连时保留旧 data，并提供 retry()。",
                },
                {
                  name: "options.signal",
                  type: "AbortSignal",
                  body: "取消 Client 调用并传播给 Host handler。",
                },
              ],
            },
          ],
        },
        {
          id: "transport",
          title: "ApiError 与传输规则",
          blocks: [
            {
              kind: "api",
              rows: [
                { name: "transport", type: "ApiError.kind", body: "请求或响应传输失败。" },
                {
                  name: "remote",
                  type: "ApiError.kind",
                  body: "Host handler 返回官方远端失败；可能包含 remoteCode。",
                },
                {
                  name: "contract",
                  type: "ApiError.kind",
                  body: "输入/输出校验或 contract framing 失败。",
                },
                { name: "aborted", type: "ApiError.kind", body: "调用方或组件生命周期取消请求。" },
                {
                  name: "unavailable",
                  type: "ApiError.kind",
                  body: "Connection / Provider 不可用。",
                },
              ],
            },
            {
              kind: "list",
              items: [
                "API 是基于官方 Client Connection Service 的一元请求/响应调用。",
                "JSON payload 上限为 1 MiB。",
                "ApiError 还提供 apiId、method、retryable、可选 remoteCode 与 cause。",
                "Connection 丢失会明确暴露；DSHX 不虚构离线传输，也不排队写入。",
              ],
            },
          ],
        },
        {
          id: "advanced-runtime",
          title: "高级 Runtime export",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "apiChannel(packageId, apiId)",
                  type: "string",
                  body: "返回一个 package contract 使用的稳定哈希 RPC channel。",
                },
                {
                  name: "registerApi(ctx, packageId, registration)",
                  type: "Promise<void>",
                  body: "直接注册 Host implementation，并通过 ctx.effect() 挂接 disposer；defineHost 通常会代为调用。",
                },
                {
                  name: "createApiClient(context, contract, packageId?)",
                  type: "ApiClient<Methods>",
                  body: "从 Cordis-like Context 创建非 Hook 类型化 Client；React 组件应使用 useApi()。",
                },
              ],
            },
          ],
        },
        {
          id: "responsibility",
          title: "Host 交互不等于状态 assembly",
          blocks: [
            {
              kind: "paragraph",
              text: "授权、校验、revision、幂等、业务取消与持久化结果属于 Host；API 返回值不会隐式修改 Settings 或已 assembly 的 Conversation 数据。",
            },
          ],
        },
      ],
    },
  },
});
