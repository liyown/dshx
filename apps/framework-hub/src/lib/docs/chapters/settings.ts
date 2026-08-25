import { defineDocsChapter } from "../types";

const settingsSignature = `interface SettingsDefinition<Schema, ClientValue> {
  readonly namespace: string
  readonly schema: Schema
  readonly applies?: 'live' | 'restart'
  readonly client?: { decode(value: unknown): ClientValue | undefined }
}

function defineSettings<
  const Schema extends z<any, object>,
  ClientValue = SettingsValue<Schema>,
>(definition: SettingsDefinition<Schema, ClientValue>): SettingsContract<Schema, ClientValue>

interface SettingsContract<Schema, ClientValue> {
  kind: 'settings'
  namespace: string
  schema: Schema
  applies: 'live' | 'restart'
  client?: { decode(value: unknown): ClientValue | undefined }
  host(options: SettingsHostOptions<SettingsValue<Schema>>): SettingsHostContribution
}`;

const hookSignature = `function useSettings<Schema extends z<any, object>, ClientValue>(
  contract: SettingsContract<Schema, ClientValue>,
): SettingsState<SettingsValue<Schema>, ClientValue>`;

const settingsExample = `// src/settings.ts
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
import { defineHost } from '@becomeopc/dshx/host'
import { runtimeSettings } from './settings'

export default defineHost({ settings: [runtimeSettings] })

// src/client.tsx — inside a DSHX Slot component
import { useSettings } from '@becomeopc/dshx/client'
import { runtimeSettings } from './settings'

function ActivityToggle() {
  const settings = useSettings(runtimeSettings)
  return (
    <button
      disabled={settings.mutation.pending}
      onClick={() => void settings.set('showActivity', false)}
    >
      Hide activity
    </button>
  )
}`;

const hostFacetExample = `import { defineHost } from '@becomeopc/dshx/host'
import { runtimeSettings } from './settings'

export default defineHost({
  settings: [
    runtimeSettings.host({
      base: { showActivity: true },
      validate(value) {
        if (typeof value.showActivity !== 'boolean') throw new Error('invalid')
      },
      setup(scope, ctx) {
        return scope.watch((next) => console.info(next))
      },
    }),
  ],
})`;

export const settings = defineDocsChapter({
  slug: "settings",
  group: "contributions",
  copy: {
    en: {
      navigation: "Settings API",
      eyebrow: "04 · API reference",
      title: "Settings API",
      intro:
        "A portable Schemastery contract carries the namespace and value types. The Host claims ownership once; Client components consume that same identity with useSettings.",
      description:
        "Define typed DSH Settings contracts, register Host ownership, and consume them with useSettings.",
      sections: [
        {
          id: "contract",
          label: "@becomeopc/dshx/settings",
          title: "defineSettings(definition)",
          blocks: [
            {
              kind: "paragraph",
              text: "Creates one portable namespace contract. It preserves schema identity and infers the Host value from the official Schemastery schema.",
            },
            { kind: "code", title: "Signature", code: settingsSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "namespace",
                  type: "string",
                  body: "Required stable name matching /^[a-z][a-z0-9-]*$/.",
                },
                {
                  name: "schema",
                  type: "Schemastery object schema",
                  body: "Required official schema. ReturnType<Schema> becomes the Host value type.",
                },
                {
                  name: "applies",
                  type: "'live' | 'restart'",
                  body: "Defaults to live and is forwarded to Host registration and Client metadata.",
                },
                {
                  name: "client.decode",
                  type: "unknown → ClientValue | undefined",
                  body: "Optional decoder for the redacted mirror. Its return type becomes settings.value on the Client.",
                },
                {
                  name: "return",
                  type: "SettingsContract",
                  body: "Share this exact object between Host ownership and Client Hooks.",
                },
              ],
            },
            { kind: "code", title: "Settings contract and use", code: settingsExample },
            {
              kind: "note",
              text: "There is no ClientDefinition.settings. Retaining useSettings(contract) is the Client capability declaration.",
            },
          ],
        },
        {
          id: "state",
          title: "useSettings(contract)",
          blocks: [
            { kind: "code", title: "Signature", code: hookSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "status",
                  type: "loading | ready | unavailable",
                  body: "Reports whether the official shared mirror is loading, ready, or unavailable.",
                },
                {
                  name: "value",
                  type: "ClientValue | undefined",
                  body: "Reads the decoded Client-safe value through useSyncExternalStore.",
                },
                {
                  name: "base / user / revision",
                  type: "official snapshot",
                  body: "Exposes the official layered state and revision without creating a DSHX cache.",
                },
                {
                  name: "writable / mode / applies",
                  type: "scope metadata",
                  body: "Describes the current bound official Client scope.",
                },
                {
                  name: "secrets / error",
                  type: "redaction and read diagnostics",
                  body: "Distinguishes provider, namespace, decoder, and synchronization failures.",
                },
                {
                  name: "mutation",
                  type: "{ pending, error, clearError }",
                  body: "Tracks writes per Hook instance without optimistic updates, automatic retries, or retained write values.",
                },
                {
                  name: "set / unset",
                  type: "Promise<void>",
                  body: "set(field, value) and unset(field) accept top-level schema keys; values use the Host schema type.",
                },
              ],
            },
          ],
        },
        {
          id: "host-facet",
          title: "Add Host-only behavior only when needed",
          blocks: [
            {
              kind: "paragraph",
              text: "The .host() facet carries base, validation, and typed SettingsScope setup. Its setup is synchronous and may return a disposer, which DSHX gives to ctx.effect(). These fields do not enter the Client artifact.",
            },
            {
              kind: "api",
              rows: [
                { name: "base", type: "Partial<HostValue>", body: "Optional Host base layer." },
                {
                  name: "validate",
                  type: "(value: HostValue) => void",
                  body: "Optional synchronous validation after official schema decoding.",
                },
                {
                  name: "setup",
                  type: "(scope, ctx) => void | disposer",
                  body: "Optional synchronous access to typed SettingsScope. A returned disposer is registered with ctx.effect().",
                },
              ],
            },
            { kind: "code", title: "src/host.ts", code: hostFacetExample },
          ],
        },
        {
          id: "secrets",
          title: "Secrets are write-only on the Client",
          blocks: [
            {
              kind: "paragraph",
              text: "When the schema contains role('secret'), provide client.decode and return a Client-safe type with secret values removed. The Client may still set or unset schema fields, but can only read configured state for secrets.",
            },
            {
              kind: "api",
              rows: [
                {
                  name: "provider-unavailable",
                  type: "SettingsReadError",
                  body: "The Slot has no Settings runtime provider.",
                },
                {
                  name: "namespace-unregistered",
                  type: "SettingsReadError",
                  body: "The Host has not registered this contract namespace; writes are rejected.",
                },
                {
                  name: "decode-failed",
                  type: "SettingsReadError",
                  body: "client.decode threw or rejected the redacted mirror value.",
                },
                {
                  name: "sync-failed",
                  type: "SettingsReadError",
                  body: "The official mirror failed to synchronize.",
                },
              ],
            },
            {
              kind: "note",
              text: "DSH owns persistence, layering, revision fences, redaction, schema validation, failure recovery, watching, and scope disposal.",
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "Settings API",
      eyebrow: "04 · API 参考",
      title: "Settings API",
      intro:
        "可移植 Schemastery contract 携带 namespace 与值类型；Host 声明一次所有权，Client 组件通过 useSettings 消费同一 identity。",
      description: "定义类型化 DSH Settings contract、注册 Host 所有权并通过 useSettings 使用。",
      sections: [
        {
          id: "contract",
          label: "@becomeopc/dshx/settings",
          title: "defineSettings(definition)",
          blocks: [
            {
              kind: "paragraph",
              text: "创建一个可移植 namespace contract；保留 schema 对象身份，并从官方 Schemastery schema 推断 Host value。",
            },
            { kind: "code", title: "函数签名", code: settingsSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "namespace",
                  type: "string",
                  body: "必填稳定名称，必须匹配 /^[a-z][a-z0-9-]*$/。",
                },
                {
                  name: "schema",
                  type: "Schemastery object schema",
                  body: "必填官方 schema；ReturnType<Schema> 成为 Host value 类型。",
                },
                {
                  name: "applies",
                  type: "'live' | 'restart'",
                  body: "默认 live，透传给 Host 注册与 Client metadata。",
                },
                {
                  name: "client.decode",
                  type: "unknown → ClientValue | undefined",
                  body: "可选的 redacted mirror decoder；返回类型成为 Client 的 settings.value。",
                },
                {
                  name: "返回值",
                  type: "SettingsContract",
                  body: "Host 所有权与 Client Hook 必须共享这个对象。",
                },
              ],
            },
            { kind: "code", title: "Settings contract 与使用", code: settingsExample },
            {
              kind: "note",
              text: "不存在 ClientDefinition.settings。实际保留 useSettings(contract) 就是 Client 能力声明。",
            },
          ],
        },
        {
          id: "state",
          title: "useSettings(contract)",
          blocks: [
            { kind: "code", title: "函数签名", code: hookSignature },
            {
              kind: "api",
              rows: [
                {
                  name: "status",
                  type: "loading | ready | unavailable",
                  body: "表示官方 shared mirror 正在加载、已就绪或不可用。",
                },
                {
                  name: "value",
                  type: "ClientValue | undefined",
                  body: "通过 useSyncExternalStore 读取 Client decoder 输出的安全值。",
                },
                {
                  name: "base / user / revision",
                  type: "官方 snapshot",
                  body: "暴露官方分层状态与 revision，不创建 DSHX cache。",
                },
                {
                  name: "writable / mode / applies",
                  type: "scope metadata",
                  body: "描述当前绑定的官方 Client scope。",
                },
                {
                  name: "secrets / error",
                  type: "redaction 与读取诊断",
                  body: "区分 Provider、namespace、decoder 和同步失败。",
                },
                {
                  name: "mutation",
                  type: "{ pending, error, clearError }",
                  body: "每个 Hook 实例独立追踪写入，不 optimistic、不自动 retry、不保留写入值。",
                },
                {
                  name: "set / unset",
                  type: "Promise<void>",
                  body: "set(field, value) 与 unset(field) 只接受顶层 schema key；value 使用 Host schema 类型。",
                },
              ],
            },
          ],
        },
        {
          id: "host-facet",
          title: "只在需要时增加 Host-only 行为",
          blocks: [
            {
              kind: "paragraph",
              text: ".host() facet 承载 base、validation 与类型化 SettingsScope setup。setup 同步执行，可返回 disposer，由 DSHX 交给 ctx.effect()；这些字段不会进入 Client 产物。",
            },
            {
              kind: "api",
              rows: [
                { name: "base", type: "Partial<HostValue>", body: "可选 Host base layer。" },
                {
                  name: "validate",
                  type: "(value: HostValue) => void",
                  body: "官方 schema decode 后执行的可选同步校验。",
                },
                {
                  name: "setup",
                  type: "(scope, ctx) => void | disposer",
                  body: "可选的类型化 SettingsScope 同步 setup；返回 disposer 会交给 ctx.effect()。",
                },
              ],
            },
            { kind: "code", title: "src/host.ts", code: hostFacetExample },
          ],
        },
        {
          id: "secrets",
          title: "Client 上的 secret 只写不可读",
          blocks: [
            {
              kind: "paragraph",
              text: "schema 包含 role('secret') 时必须提供 client.decode，返回移除 secret 值的 Client-safe 类型。Client 仍可 set 或 unset schema 字段，但读取 secret 时只能获得 configured 状态。",
            },
            {
              kind: "api",
              rows: [
                {
                  name: "provider-unavailable",
                  type: "SettingsReadError",
                  body: "Slot 没有 Settings Runtime Provider。",
                },
                {
                  name: "namespace-unregistered",
                  type: "SettingsReadError",
                  body: "Host 未注册该 namespace；拒绝写入。",
                },
                {
                  name: "decode-failed",
                  type: "SettingsReadError",
                  body: "client.decode 抛错或拒绝 redacted mirror value。",
                },
                { name: "sync-failed", type: "SettingsReadError", body: "官方 mirror 同步失败。" },
              ],
            },
            {
              kind: "note",
              text: "持久化、分层、revision fence、redaction、schema validation、失败恢复、watch 与 scope dispose 都由 DSH 管理。",
            },
          ],
        },
      ],
    },
  },
});
