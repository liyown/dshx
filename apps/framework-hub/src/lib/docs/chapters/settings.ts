import { defineDocsChapter } from "../types";

const example = `// src/settings.ts — browser-safe shared contract
import Schema from '@deepseek-ai/schemastery'
import { defineSettings } from '@becomeopc/dshx/settings'

export const runtimeSettings = defineSettings({
  namespace: 'my-plugin',
  schema: Schema.object({
    showActivity: Schema.boolean().default(true),
  }),
  applies: 'live',
})

// src/host.ts — claim ownership once
export default defineHost({ settings: [runtimeSettings] })

// inside a Client Slot component
const settings = useSettings(runtimeSettings)
await settings.set('showActivity', false)
await settings.unset('showActivity')`;

const hostFacet = `export default defineHost({
  settings: [runtimeSettings.host({
    base: { showActivity: true },
    validate(value) {
      if (typeof value.showActivity !== 'boolean') throw new Error('invalid')
    },
    setup(scope) {
      return scope.watch((next) => console.info(next.value))
    },
  })],
})`;

const secretExample = `const credentials = defineSettings({
  namespace: 'my-plugin-credentials',
  schema: Schema.object({
    endpoint: Schema.string(),
    token: Schema.string().role('secret'),
  }),
  applies: 'restart',
  client: {
    decode(redacted) {
      if (!isRedactedCredentials(redacted)) throw new Error('invalid settings')
      return { endpoint: redacted.endpoint, tokenConfigured: redacted.token.configured }
    },
  },
})`;

export const settings = defineDocsChapter({
  slug: "settings",
  group: "contributions",
  copy: {
    en: {
      navigation: "Settings API",
      eyebrow: "05 · API Candidate",
      title: "Settings API",
      intro:
        "Define one Schemastery contract, register its Host ownership once, and read the same identity from Client components.",
      description:
        "Contract inference, Host facets, Client state, writes, decoder failures, and fail-closed secret schemas.",
      sections: [
        {
          id: "contract",
          label: "@becomeopc/dshx/settings",
          title: "defineSettings(definition)",
          blocks: [
            { kind: "code", title: "Shared contract", code: example },
            {
              kind: "api",
              rows: [
                {
                  name: "namespace",
                  type: "string",
                  body: "Stable namespace owned by exactly one Host registration.",
                },
                {
                  name: "schema",
                  type: "Schemastery object schema",
                  body: "The official schema object keeps its identity and infers the Host value.",
                },
                {
                  name: "applies",
                  type: "live | restart",
                  body: "Shared apply mode forwarded to Host registration and the Client descriptor.",
                },
                {
                  name: "client.decode",
                  type: "unknown → ClientValue",
                  body: "Optional redacted-value decoder. Its return type becomes settings.value; failure must throw and must never use undefined as a sentinel.",
                },
                {
                  name: "return",
                  type: "SettingsContract",
                  body: "Browser-safe opaque contract. Host-only base, validate, and setup values are absent until .host() is called.",
                },
              ],
            },
            {
              kind: "note",
              text: "There is no Client Settings declaration. The Host must register the namespace; a retained useSettings(contract) call declares the Client capability.",
            },
          ],
        },
        {
          id: "host-facet",
          title: "contract.host(options)",
          blocks: [
            { kind: "code", title: "Host-only facet", code: hostFacet },
            {
              kind: "api",
              rows: [
                { name: "base", type: "Partial<HostValue>", body: "Optional Host base layer." },
                {
                  name: "validate",
                  type: "(value: HostValue) => void",
                  body: "Synchronous validation after official schema decoding.",
                },
                {
                  name: "setup",
                  type: "(scope, ctx) => void | disposer",
                  body: "Synchronous typed SettingsScope setup. A returned disposer is attached with ctx.effect().",
                },
              ],
            },
            {
              kind: "paragraph",
              text: "Host registration order is Tools, Commands, Prompts, Settings, APIs, then setup(ctx). A non-empty settings array adds and deduplicates the official settings inject.",
            },
          ],
        },
        {
          id: "state",
          title: "useSettings(contract)",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "status",
                  type: "loading | ready | unavailable",
                  body: "Readiness of the official shared mirror.",
                },
                {
                  name: "value",
                  type: "ClientValue | undefined",
                  body: "Decoded Client-safe value read with useSyncExternalStore.",
                },
                {
                  name: "revision",
                  type: "number | undefined",
                  body: "Current official revision.",
                },
                {
                  name: "writable",
                  type: "boolean",
                  body: "false when the provider or namespace is unavailable; writes reject before calling the official API.",
                },
                {
                  name: "mode / applies",
                  type: "host | memory; live | restart",
                  body: "Current official scope metadata and shared apply mode.",
                },
                {
                  name: "secrets",
                  type: "readonly { path; set }[]",
                  body: "Configured state only; never secret values.",
                },
                {
                  name: "error",
                  type: "SettingsReadError | null",
                  body: "Provider unavailable, namespace unregistered, decode failed, or sync failed.",
                },
                {
                  name: "mutation.pending",
                  type: "boolean",
                  body: "A counter-derived flag that stays true while any write is in the official mutation queue.",
                },
                {
                  name: "set / unset",
                  type: "Promise<void>",
                  body: "Top-level schema field writes. Resolution means the official queue and recovery flow finished, not that durable persistence is guaranteed.",
                },
              ],
            },
            {
              kind: "note",
              text: "The Hook does not expose base, user, mutation.error, or clearError(). It does not optimistically change value, retain write values, or retry writes.",
            },
          ],
        },
        {
          id: "secrets",
          title: "Secret schemas fail closed",
          blocks: [
            { kind: "code", title: "Secret-safe decoder", code: secretExample },
            {
              kind: "list",
              items: [
                "A reachable role('secret') requires client.decode; the decoder must remove the secret and may expose only configured state.",
                "Only official safely redacted object, dict, and array paths are accepted.",
                "A reachable secret through union, intersection, or transform is rejected during Host registration even when a decoder exists.",
                "set() and unset() use the Host schema type, so a secret field can be written but cannot be read from settings.value.",
              ],
            },
            {
              kind: "paragraph",
              text: "DSH continues to own persistence, layers, revisions, redaction, validation, watch, failure recovery, and scope disposal.",
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "Settings API",
      eyebrow: "05 · API Candidate",
      title: "Settings API",
      intro:
        "定义一个 Schemastery contract，Host 只声明一次所有权，Client Component 使用同一对象身份读取。",
      description:
        "Contract 推断、Host facet、Client 状态、写入、decoder 失败与 secret schema fail-closed 规则。",
      sections: [
        {
          id: "contract",
          label: "@becomeopc/dshx/settings",
          title: "defineSettings(definition)",
          blocks: [
            { kind: "code", title: "共享 contract", code: example },
            {
              kind: "api",
              rows: [
                {
                  name: "namespace",
                  type: "string",
                  body: "由一个 Host registration 独占的稳定 namespace。",
                },
                {
                  name: "schema",
                  type: "Schemastery object schema",
                  body: "保留官方 schema 对象身份，并推断 Host value。",
                },
                {
                  name: "applies",
                  type: "live | restart",
                  body: "透传给 Host registration 和 Client descriptor 的共享 apply mode。",
                },
                {
                  name: "client.decode",
                  type: "unknown → ClientValue",
                  body: "可选 redacted-value decoder；返回值类型成为 settings.value；失败必须 throw，不能用 undefined 当 sentinel。",
                },
                {
                  name: "return",
                  type: "SettingsContract",
                  body: "Browser-safe opaque contract；调用 .host() 前不包含 Host-only base、validate 和 setup。",
                },
              ],
            },
            {
              kind: "note",
              text: "Client 不重复声明 Settings。Host 必须注册 namespace；最终产物中保留的 useSettings(contract) 调用就是 Client 能力声明。",
            },
          ],
        },
        {
          id: "host-facet",
          title: "contract.host(options)",
          blocks: [
            { kind: "code", title: "Host-only facet", code: hostFacet },
            {
              kind: "api",
              rows: [
                { name: "base", type: "Partial<HostValue>", body: "可选 Host base layer。" },
                {
                  name: "validate",
                  type: "(value: HostValue) => void",
                  body: "官方 schema decode 后的同步校验。",
                },
                {
                  name: "setup",
                  type: "(scope, ctx) => void | disposer",
                  body: "同步、类型化 SettingsScope setup；返回的 disposer 通过 ctx.effect() 登记。",
                },
              ],
            },
            {
              kind: "paragraph",
              text: "Host 注册顺序是 Tools → Commands → Prompts → Settings → APIs → setup(ctx)。settings 非空时追加并去重官方 settings inject。",
            },
          ],
        },
        {
          id: "state",
          title: "useSettings(contract)",
          blocks: [
            {
              kind: "api",
              rows: [
                {
                  name: "status",
                  type: "loading | ready | unavailable",
                  body: "官方 shared mirror 就绪状态。",
                },
                {
                  name: "value",
                  type: "ClientValue | undefined",
                  body: "通过 useSyncExternalStore 读取的 Client-safe 解码值。",
                },
                { name: "revision", type: "number | undefined", body: "当前官方 revision。" },
                {
                  name: "writable",
                  type: "boolean",
                  body: "Provider 或 namespace 不可用时为 false；写入会在调用官方 API 前 reject。",
                },
                {
                  name: "mode / applies",
                  type: "host | memory; live | restart",
                  body: "当前官方 scope metadata 和共享 apply mode。",
                },
                {
                  name: "secrets",
                  type: "readonly { path; set }[]",
                  body: "只暴露 configured 状态，不暴露 secret value。",
                },
                {
                  name: "error",
                  type: "SettingsReadError | null",
                  body: "Provider unavailable、namespace unregistered、decode failed 或 sync failed。",
                },
                {
                  name: "mutation.pending",
                  type: "boolean",
                  body: "由 counter 得出；任一写入仍在官方 mutation queue 中时为 true。",
                },
                {
                  name: "set / unset",
                  type: "Promise<void>",
                  body: "顶层 schema field 写入。resolve 只表示官方 queue 与恢复流程结束，不承诺已持久化。",
                },
              ],
            },
            {
              kind: "note",
              text: "Hook 不暴露 base、user、mutation.error 或 clearError()；不 optimistic 修改 value、不保留写入值、不自动 retry。",
            },
          ],
        },
        {
          id: "secrets",
          title: "Secret schema fail closed",
          blocks: [
            { kind: "code", title: "Secret-safe decoder", code: secretExample },
            {
              kind: "list",
              items: [
                "存在可达 role('secret') 时必须提供 client.decode；decoder 必须移除 secret，只能暴露 configured 状态。",
                "只允许官方可安全 redaction 的 object、dict 和 array 路径。",
                "存在经 union、intersection 或 transform 可达的 secret 时，即使提供 decoder，Host 注册也会拒绝。",
                "set() 和 unset() 使用 Host schema 类型，所以 secret field 可写，但不能从 settings.value 读取。",
              ],
            },
            {
              kind: "paragraph",
              text: "持久化、分层、revision、redaction、validation、watch、失败恢复与 scope dispose 继续由 DSH 管理。",
            },
          ],
        },
      ],
    },
  },
});
