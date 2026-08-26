import { defineDocsChapter } from "../types";

const contractSignature = `function method<ClientInput = void, ClientOutput = unknown>():
  ApiMethodDefinition<ClientInput, ClientInput, ClientOutput, ClientOutput>

function method<InputSchema extends StandardSchemaV1, OutputSchema extends StandardSchemaV1>(
  options: { input?: InputSchema; output?: OutputSchema },
): ApiMethodDefinition<
  StandardSchemaV1.InferInput<InputSchema>,
  StandardSchemaV1.InferOutput<InputSchema>,
  StandardSchemaV1.InferInput<OutputSchema>,
  StandardSchemaV1.InferOutput<OutputSchema>
>

defineApi({ id, version, methods })`;

const completeExample = `// src/api/status.ts
import { defineApi, method } from '@becomeopc/dshx/api'

export const statusApi = defineApi({
  id: 'status',
  version: 1,
  methods: {
    get: method<void, { online: boolean }>(),
    refresh: method<{ force: boolean }, { online: boolean }>(),
  },
})

// src/host.ts
import { defineHost } from '@becomeopc/dshx/host'
import { statusApi } from './api/status.js'

export default defineHost({
  apis: [statusApi.host({
    async get({ signal }) {
      signal.throwIfAborted()
      return { online: true }
    },
    async refresh({ input }) {
      return { online: input.force }
    },
  })],
})

// inside a Client Slot component
const api = useApi(statusApi)
await api.get()
await api.get(undefined, { signal })
await api.refresh({ force: true }, { signal })

const status = useApiQuery(statusApi, 'refresh', {
  input: { force: true },
  enabled: true,
  signal,
})`;

const queryResult = `type ApiQueryResult<T> =
  | { status: 'pending'; fetchStatus: 'idle' | 'fetching' | 'paused'; data: undefined; error: null; refetch(): void }
  | { status: 'success'; fetchStatus: 'idle' | 'fetching' | 'paused'; data: T; error: null; refetch(): void }
  | { status: 'error'; fetchStatus: 'idle'; data: T | undefined; error: ApiError; refetch(): void }`;

export const typedApi = defineDocsChapter({
  slug: "typed-api",
  group: "contributions",
  copy: {
    en: {
      navigation: "Typed API",
      eyebrow: "06 · API Candidate",
      title: "Typed Host–Client API",
      intro:
        "Define unary methods once, implement every method on the Host, and call the inferred imperative or query client from React.",
      description:
        "Standard Schema transforms, exact Host handlers, imperative calls, useApiQuery states, cancellation, and errors.",
      sections: [
        {
          id: "contract",
          label: "@becomeopc/dshx/api",
          title: "method() and defineApi()",
          blocks: [
            { kind: "code", title: "Signatures", code: contractSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "method<I, O>()",
                  type: "I → I → O → O",
                  body: "Declares TypeScript-only Client input, Host input, Host output, and Client output when no runtime transform is needed.",
                },
                {
                  name: "method({ input, output })",
                  type: "Standard Schema v1",
                  body: "InferInput is the serialized-side type and InferOutput is the parsed-side type. @standard-schema/spec ^1.1.0 supplies the protocol.",
                },
                { name: "id", type: "string", body: "Stable API id without slash." },
                { name: "version", type: "positive integer", body: "Wire contract version." },
                {
                  name: "methods",
                  type: "Record<string, ApiMethodDefinition>",
                  body: "Literal method keys preserved in the Host registration and Client type.",
                },
              ],
            },
            { kind: "code", title: "Shared contract, Host, and Client", code: completeExample },
          ],
        },
        {
          id: "host",
          title: "contract.host(handlers, options?)",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "handlers",
                  type: "exact ApiHandlers<Methods>",
                  body: "Every method is required and extra keys are rejected by TypeScript and the Host definition diagnostic.",
                },
                {
                  name: "{ input, ctx, signal }",
                  type: "ApiHandlerContext<HostInput>",
                  body: "Receives transformed Host input, the native Cordis Context, and the caller cancellation signal.",
                },
                {
                  name: "authority",
                  type: "loopback | trusted-host",
                  body: "Defaults to loopback and is forwarded to the official Connection service.",
                },
              ],
            },
            {
              kind: "paragraph",
              text: "Schemas run only at the authoritative Host edge: Client JSON enters the input schema once, the handler returns Host output, then the output schema runs once before Client JSON is sent. The Client bundle does not execute the schemas.",
            },
          ],
        },
        {
          id: "imperative",
          title: "useApi(contract)",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "api.get()",
                  type: "Promise<ClientOutput>",
                  body: "Void-input method call.",
                },
                {
                  name: "api.get(undefined, { signal })",
                  type: "Promise<ClientOutput>",
                  body: "Pass call options in the second argument. DSHX never treats a first object argument as options.",
                },
                {
                  name: "api.refresh(input, { signal })",
                  type: "Promise<ClientOutput>",
                  body: "Object-input method call with an unambiguous optional second argument.",
                },
                {
                  name: "api.safe.<method>()",
                  type: "Promise<{ ok: true; value } | { ok: false; error }>",
                  body: "Returns a discriminated result instead of rejecting with ApiError.",
                },
              ],
            },
          ],
        },
        {
          id: "query",
          title: "useApiQuery(contract, method, options)",
          blocks: [
            { kind: "code", title: "Result union", code: queryResult },
            {
              kind: "api",
              rows: [
                {
                  name: "input",
                  type: "required for non-void methods",
                  body: "Method input, fingerprinted with stable JSON for automatic reads.",
                },
                {
                  name: "enabled",
                  type: "boolean",
                  body: "false stops automatic reads; refetch() still performs a manual read.",
                },
                {
                  name: "signal",
                  type: "AbortSignal",
                  body: "Caller cancellation becomes an aborted ApiError.",
                },
                {
                  name: "fetchStatus: paused",
                  type: "pending or success",
                  body: "The Host generation disappeared. The last successful data is kept and an enabled query reads again after reconnect.",
                },
                {
                  name: "refetch()",
                  type: "void",
                  body: "Starts a new read without adding a global cache, dedupe layer, optimistic update, or business retry policy.",
                },
              ],
            },
          ],
        },
        {
          id: "errors",
          title: "ApiError and isApiError()",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "kind",
                  type: "transport | remote | contract | aborted | unavailable",
                  body: "Stable error category.",
                },
                { name: "apiId / method", type: "string", body: "Failed contract and method." },
                {
                  name: "retryable",
                  type: "boolean",
                  body: "Transport hint; it does not trigger an automatic retry.",
                },
                {
                  name: "remoteCode",
                  type: "string | undefined",
                  body: "Optional official remote error code.",
                },
                {
                  name: "isApiError(value)",
                  type: "value is ApiError",
                  body: "Public type guard for the read-only opaque error. No public constructor or transport helper exists.",
                },
              ],
            },
            {
              kind: "note",
              text: "Lifecycle cleanup cancellation is not shown as a remote error. A caller-provided abort is reported as kind: aborted.",
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "类型化 API",
      eyebrow: "06 · API Candidate",
      title: "类型化 Host–Client API",
      intro:
        "只定义一次一元 method，在 Host 精确实现每个 method，再从 React 调用推断后的 imperative 或 query client。",
      description:
        "Standard Schema transform、精确 Host handler、imperative 调用、useApiQuery 状态、取消与错误。",
      sections: [
        {
          id: "contract",
          label: "@becomeopc/dshx/api",
          title: "method() 与 defineApi()",
          blocks: [
            { kind: "code", title: "签名", code: contractSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "method<I, O>()",
                  type: "I → I → O → O",
                  body: "不需要运行时 transform 时，声明 Client input、Host input、Host output 和 Client output。",
                },
                {
                  name: "method({ input, output })",
                  type: "Standard Schema v1",
                  body: "InferInput 是序列化侧类型，InferOutput 是 parse 后类型；协议来自 @standard-schema/spec ^1.1.0。",
                },
                { name: "id", type: "string", body: "不含斜杠的稳定 API id。" },
                { name: "version", type: "正整数", body: "Wire contract 版本。" },
                {
                  name: "methods",
                  type: "Record<string, ApiMethodDefinition>",
                  body: "在 Host registration 和 Client 类型中保留字面量 method key。",
                },
              ],
            },
            { kind: "code", title: "共享 contract、Host 与 Client", code: completeExample },
          ],
        },
        {
          id: "host",
          title: "contract.host(handlers, options?)",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "handlers",
                  type: "exact ApiHandlers<Methods>",
                  body: "每个 method 都必须实现；TypeScript 和 Host definition 诊断都会拒绝多余 key。",
                },
                {
                  name: "{ input, ctx, signal }",
                  type: "ApiHandlerContext<HostInput>",
                  body: "接收 transform 后 Host input、原生 Cordis Context 和调用方取消信号。",
                },
                {
                  name: "authority",
                  type: "loopback | trusted-host",
                  body: "默认 loopback，透传给官方 Connection Service。",
                },
              ],
            },
            {
              kind: "paragraph",
              text: "Schema 只在权威 Host 边界执行：Client JSON 进入 input schema 一次，handler 返回 Host output，output schema 再执行一次后发送 Client JSON。Client bundle 不执行 schema。",
            },
          ],
        },
        {
          id: "imperative",
          title: "useApi(contract)",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "api.get()",
                  type: "Promise<ClientOutput>",
                  body: "void-input method 调用。",
                },
                {
                  name: "api.get(undefined, { signal })",
                  type: "Promise<ClientOutput>",
                  body: "在第二参数传 options；DSHX 不会把第一个 object 误判为 options。",
                },
                {
                  name: "api.refresh(input, { signal })",
                  type: "Promise<ClientOutput>",
                  body: "object input 与无歧义的可选第二参数。",
                },
                {
                  name: "api.safe.<method>()",
                  type: "Promise<{ ok: true; value } | { ok: false; error }>",
                  body: "返回可判别结果，不以 ApiError reject。",
                },
              ],
            },
          ],
        },
        {
          id: "query",
          title: "useApiQuery(contract, method, options)",
          blocks: [
            { kind: "code", title: "结果联合", code: queryResult },
            {
              kind: "api",
              rows: [
                {
                  name: "input",
                  type: "非 void method 必填",
                  body: "method input，通过 stable JSON fingerprint 驱动自动读取。",
                },
                {
                  name: "enabled",
                  type: "boolean",
                  body: "false 停止自动读取；refetch() 仍执行手动读取。",
                },
                {
                  name: "signal",
                  type: "AbortSignal",
                  body: "调用方取消映射为 aborted ApiError。",
                },
                {
                  name: "fetchStatus: paused",
                  type: "pending 或 success",
                  body: "Host generation 丢失。保留上次成功 data，并在重连后自动重读已启用 query。",
                },
                {
                  name: "refetch()",
                  type: "void",
                  body: "发起新读取，不增加全局 cache、dedupe、optimistic update 或业务 retry。",
                },
              ],
            },
          ],
        },
        {
          id: "errors",
          title: "ApiError 与 isApiError()",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "kind",
                  type: "transport | remote | contract | aborted | unavailable",
                  body: "稳定错误分类。",
                },
                { name: "apiId / method", type: "string", body: "失败的 contract 和 method。" },
                {
                  name: "retryable",
                  type: "boolean",
                  body: "Transport 提示；不会触发自动 retry。",
                },
                {
                  name: "remoteCode",
                  type: "string | undefined",
                  body: "可选的官方 remote error code。",
                },
                {
                  name: "isApiError(value)",
                  type: "value is ApiError",
                  body: "读取只读 opaque error 的公开 type guard；不暴露 constructor 或 transport helper。",
                },
              ],
            },
            {
              kind: "note",
              text: "生命周期 cleanup 取消不显示为 remote error；调用方传入的 abort 会报告 kind: aborted。",
            },
          ],
        },
      ],
    },
  },
});
