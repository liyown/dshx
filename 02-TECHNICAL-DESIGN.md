# DSHX 技术设计文档

> 文档状态：Implementation Design  
> 对应 PRD：`01-PRD.md`  
> 初始兼容目标：DeepSeek Harness `0.1.0-rc.8`  
> 技术栈：TypeScript、Vite/Rolldown、Node.js、React（Client 使用 DSH 提供的 React runtime）  
> 核心架构原则：**Build-time framework，Runtime-thin。**

---

## 1. 技术目标

DSHX 的技术实现必须解决以下工程问题：

1. 将普通 TypeScript Host 源码编译为 DSH 可加载的 Node ESM Plugin。
2. 将普通 React TSX / CSS Modules 编译为 DSH Client Module Loader 可加载的 lazy-CJS factory。
3. 使用 DSH 原生 Client HMR，不建立新的浏览器插件 HMR。
4. 自动完成外部插件开发所需的 package / bundle / profile 工程接入。
5. 为常用 DSH API 提供薄 Helper，同时保持原生 `ctx` escape hatch。
6. 建立版本兼容层，隔离 DSH RC 阶段的工程协议变化。
7. 通过 Inspect / Scaffold 降低动态 Composition 的可发现性问题。
8. 让所有复杂运行语义继续由 Cordis / DSH 持有。

---

## 2. 已验证的 DSH 架构事实

实现前必须将以下事实视为设计约束。

### 2.1 Cordis 是 Plugin Kernel

DSH 的插件系统建立在 Cordis 上。

核心语义：

```text
Plugin
  ↓
Context
  ↓
Service / Event / Effect
  ↓
Fiber lifecycle
```

`inject` 表示 hard Service dependency。缺少 Service 时 Fiber 可以保持 Pending；Service 出现后由 Cordis 激活。

`ctx.effect()`、`ctx.on()` 等注册属于可逆生命周期贡献，Fiber teardown 时撤销。

因此 DSHX 不实现自己的插件 dispose registry。

### 2.2 Host / Client 是两个不同运行环境

Host：

```text
Node.js
Cordis
Agent / Session / Tool / LLM / FS / Sandbox ...
```

Client：

```text
Browser
Cordis Client Context
Client Module Loader
Session object layer
Slot Registry
React UI Renderer
```

必须分别构建。

### 2.3 Client Plugin 是独立脚本 Bundle

当前 DSH Client plugin package：

- `package.json` 声明 `dsh.client`。
- 导出 `./client`。
- Client Bundle 是 script-loaded lazy-CJS factory。
- Bundle 在浏览器中通过 `window.__ModuleLoader__.load({ id, factory })` 注册。
- Factory 通过 DSH Module Table 提供的同步 `require` 获取 externals。

官方仓库内部 `packages/client/tsdown.client.ts` 已实现该产物，但 preset 当前不是外部插件可稳定依赖的已发布构建 API。

### 2.4 Client HMR 已存在

DSH `@deepseek-ai/dsh-client-hmr`：

Node Half：

1. 维护当前 Client graph bundle path。
2. 周期性 stat-poll 每个 graph bundle。
3. 文件 mtime/size 变化后重新 hash bundle。
4. rev 变化时广播 `/plugins/events` 的 `rebuilt` frame。

Browser Half：

```text
rebuilt
  ↓
module.invalidate(id)
  ↓
module.prefetch(id)
  ↓
registry.delete(...)
  ↓
dispose old Fiber
  ↓
remove <style data-plugin>
  ↓
entry.refresh()
  ↓
fiber.await()
```

Cordis 自己负责 dependent Fiber cascade。

结论：

**任何 watcher 只要持续重写真实 `client.js` 文件，DSH HMR 都能观察到，不需要 builder→host 通知协议。**

因此：

- DSHX Client 开发使用 Vite/Rolldown `build --watch`。
- 不需要向 DSH 添加 rebuild API。
- 不需要让 Vite Dev Server 接管真实 DSH 页面。

### 2.5 React local state 在真实 HMR 中不保证保留

DSH 当前 HMR 设计是 coarse Fiber reload：

- Plugin Fiber 重建。
- Plugin React components 重建。
- React local state 丢失。
- Connection / Runtime / Session objects 等未重载数据层可保留。

DSHX v0.x 接受该语义。

### 2.6 Slot 是官方 Client UI 扩展点

官方 UI composition 只有一条主路径：

```ts
ctx.slots.register(...)
```

实际插件通常使用：

```ts
ctx.slots.inject(slotName, () =>
  ctx.slots.register(options, Component)
)
```

Slot 协议包含：

- `single`
- `list`
- `keyed`
- `chain`

Scope 至少包含：

- root/global
- session

React Component 的可变外部数据由 DSH renderer 生成的标准 hooks / props 提供。

业务 Component 不应直接读取 Client `ctx`。

### 2.7 Client React store bridge 已由 DSH 实现

DSH `ui-renderer` 使用 `useSyncExternalStoreWithSelector` 将 bare ObservableSnapshot 转换为 typed selector hook。

因此 DSHX 不实现：

```text
DshProvider
useDsh
useSessions (第二套)
useSession (第二套)
```

### 2.8 Profile / Bundle 已有官方管理路径

Bundle：

```json
{
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

Profile 是有序 Bundle composition。

外部插件安装使用：

```bash
dsh plugin --profile <name> add ./plugin
```

官方 CLI 负责 pnpm 执行与 Bundle layer reconciliation。

DSHX 只 orchestrate，不直接实现 Profile package manager。

---

## 3. 总体架构

```text
                            Developer
                                │
                    TS / TSX / CSS Modules
                                │
                                ▼
                     ┌────────────────────┐
                     │        DSHX        │
                     └─────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
     Scaffold              Build System             CLI
                               │
                   ┌───────────┴───────────┐
                   ▼                       ▼
             Host Compiler            Client Compiler
                   │                       │
                Node ESM            lazy-CJS factory
                   │                       │
                   ▼                       ▼
              DSH Host             ClientModuleLoader
                   │                       │
              Cordis Fiber            Cordis Fiber
                   │                       │
         Agent/Tool/Service              Slots
                                           │
                                           ▼
                                         React
```

运行时依赖方向：

```text
DSHX helper
   ↓
official DSH API
   ↓
Cordis
```

禁止：

```text
DSH
  ↓
DSHX Runtime
  ↓
second Agent/Session/UI runtime
```

---

## 4. 仓库结构

第一阶段使用 monorepo，但发布尽量少包。

推荐：

```text
dshx/
├── packages/
│   ├── dshx/
│   │   ├── src/
│   │   │   ├── host/
│   │   │   ├── client/
│   │   │   ├── config/
│   │   │   ├── compiler/
│   │   │   │   ├── host/
│   │   │   │   └── client/
│   │   │   ├── compat/
│   │   │   ├── inspect/
│   │   │   ├── scaffold/
│   │   │   ├── diagnostics/
│   │   │   └── cli/
│   │   └── package.json
│   └── create-dshx/
├── fixtures/
│   ├── host-only/
│   ├── client-only/
│   └── full/
└── tests/
```

初期发布：

```text
dshx
create-dshx
```

`dshx` subpath：

```json
{
  "exports": {
    ".": "...",
    "./host": "...",
    "./client": "...",
    "./config": "...",
    "./vite": "..."
  }
}
```

不要第一版拆成：

```text
@dshx/core
@dshx/react
@dshx/server
@dshx/devtools
@dshx/cli
...
```

拆包条件：出现独立消费者或依赖隔离的真实需要。

---

## 5. 用户项目识别

默认约定：

```text
src/host.ts
src/client.tsx
```

配置解析优先级：

```text
explicit dshx.config.ts
        ↓
file convention
        ↓
package.json.name
        ↓
defaults
```

配置模型：

```ts
interface DshxConfig {
  name?: string

  host?: string | false
  client?: string | false

  profile?: string

  dev?: {
    hostRestart?: 'manual' | 'auto'
  }

  build?: {
    sourcemap?: boolean
  }

  compatibility?: {
    allowUnsupported?: boolean
  }
}
```

不要放入：

```text
tools
events
slots
prompts
agents
sessions
```

这些属于代码。

---

## 6. Host 编译器

### 6.1 用户源码

```ts
// src/host.ts

export default defineHost({
  tools: [hello],

  inject: ['agents'],

  setup(ctx) {
    ...
  },
})
```

### 6.2 不直接要求用户导出 `apply`

通过虚拟 Entry 适配。

```text
virtual:dshx-host-entry
```

概念生成：

```ts
import definition from '/absolute/src/host.ts'
import { createHostPlugin } from 'dshx/internal-host-runtime'

const plugin = createHostPlugin(definition, {
  packageName: 'dsh-example',
})

export const name = plugin.name
export const inject = plugin.inject
export const Config = plugin.Config

export function apply(ctx, config) {
  return plugin.apply(ctx, config)
}
```

注意：

- `createHostPlugin` 必须很薄。
- 运行时不维护自己的 registry。
- Shortcut 只在 `apply()` 内调用官方服务注册。

### 6.3 `defineHost`

`defineHost()` 本身应接近 identity function：

```ts
export function defineHost<T extends HostDefinition>(definition: T): T {
  return definition
}
```

主要价值：

- 类型推断。
- Marker。
- 构建器验证。

### 6.4 `createHostPlugin`

注册顺序固定：

```text
1. framework-required shortcuts
2. user declared tools
3. future prompt/command shortcuts
4. setup(ctx)
```

每个 Shortcut 使用官方 API。

Tools：

```ts
for (const tool of definition.tools ?? []) {
  ctx.tools.register(tool)
}
```

如果 `tools.length > 0`：

```text
inject union += 'tools'
```

禁止维护本地 disposer 列表，除非官方 API 明确返回 disposer 且不自动挂 caller Fiber；这种情况统一放入 `ctx.effect()`。

---

## 7. Client 编译器：最关键模块

### 7.1 目标产物

用户：

```tsx
// src/client.tsx

export default defineClient({
  slots: [status],
})
```

最终：

```text
dist/client.js
dist/client.js.map
```

`client.js` 必须是 DSH Script Loader 可执行产物。

示意：

```js
window.__ModuleLoader__.load({
  id: 'dsh-example',

  factory(require) {
    const module = { exports: {} }
    const exports = module.exports

    // bundler generated CJS body

    return module.exports
  },
})
```

### 7.2 为什么不用普通 ESM

DSH Client Module System 需要：

- 同步 `require` 到 frozen module table。
- lazy factory registration。
- independently built plugin bundle。
- invalidate / prefetch / rematerialize。

普通浏览器 ESM bundle 不符合当前 DSH Client plugin contract。

### 7.3 Vite 使用方式

真实 DSH 开发环境：

```text
Vite/Rolldown Build API
```

不用：

```text
Vite HTML dev server + HMR websocket
```

实现建议：

- Programmatic `vite.build()`。
- Watch 模式使用 build watcher。
- 使用 plugin hooks 修改 output。
- Client 采用 CJS intermediary output。
- `inlineDynamicImports: true`（v0.1）。
- 单 entry。
- 单 JS chunk。

如果 Vite/Rolldown 对该特殊 CJS wrapper 存在阻碍，允许直接使用其底层 Rolldown API；但 DSHX 对外仍表现为 Vite-based build system。

### 7.4 Virtual Client Entry

用户默认导出 descriptor：

```ts
export default defineClient(...)
```

虚拟入口：

```ts
import definition from '/src/client.tsx'
import { createClientPlugin } from 'dshx/internal-client-runtime'

const plugin = createClientPlugin(definition)

module.exports = plugin
```

最终 CJS exports 必须满足 Cordis plugin shape：

```text
name?
inject?
apply(ctx)
Config?
```

### 7.5 Client Cordis `inject`

不要与 package manifest `dsh.client.inject` 混淆。

#### Runtime Service dependency

源码：

```ts
defineClient({
  inject: ['remote'],
  slots: [...]
})
```

生成 Client Plugin：

```ts
inject = ['remote', 'slots']
```

其中：

- `slots` 因使用 `defineSlot` 自动添加。
- 用户声明的 hard dependencies 保留。

#### Module graph package dependency

`package.json`：

```json
{
  "dsh": {
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-runtime"
      ]
    }
  }
}
```

这是 package/module graph 维度。

必须在代码和命名中区分。

建议内部名称：

```text
serviceInject
clientPackageInject
```

公共配置不要都叫 `inject`。

---

## 8. Client External 策略

### 8.1 当前平台共享模块

兼容 `rc.8` 的基线至少包含官方 Web platform 当前共享身份：

```text
react
react/jsx-runtime
react-dom
react-dom/client
@deepseek-ai/cordis
@deepseek-ai/dsh-client-ui-slots
@deepseek-ai/dsh-client-ui-primitives
```

预加载动态 external 当前包含：

```text
@deepseek-ai/dsh-client-runtime/client
```

实现 Agent 必须在编码前再次核对当前目标版本源码：

```text
packages/client/web/src/platform.ts
```

### 8.2 为什么必须 External

如果 plugin bundle 自带 React：

```text
DSH React instance
+
Plugin React instance
```

可能导致：

- hooks identity 问题。
- Context 不共享。
- renderer / element runtime 不一致。
- bundle 体积增大。

所以 `react` family 必须由 DSH module table 统一提供。

### 8.3 Compat Adapter

```ts
interface DshCompatibilityAdapter {
  version: string

  client: {
    platformModules: readonly string[]
    preloadedExternals: readonly string[]
    clientManifest: ClientManifestRules
    bundle: BundleContract
  }
}
```

例如：

```text
compat/0.1.0-rc.8.ts
```

不要直接在编译器散落 `@deepseek-ai/...` 字符串。

---

## 9. Client Bundle Wrapper Plugin

Vite/Rolldown plugin：

```text
dshx-client-wrapper
```

职责：

1. 确认只有一个 client JS entry。
2. 确认没有未处理 dynamic chunks。
3. 将 CJS body 包进 ModuleLoader registration。
4. 固定 plugin id。
5. 保留 sourcemap mapping。
6. 写 `client.js`。
7. 写 `client.js.map`。

伪代码：

```ts
generateBundle(_opts, bundle) {
  const entry = findSingleEntry(bundle)

  const original = entry.code

  entry.code = `
window.__ModuleLoader__.load({
  id: ${JSON.stringify(pluginId)},
  factory(require) {
    const module = { exports: {} };
    const exports = module.exports;
    ${original}
    return module.exports;
  }
});
//# sourceMappingURL=client.js.map
`
}
```

实际实现必须正确 compose source map，不能简单字符串拼接后保留错误 map。

建议：

- 使用 MagicString 或 Rolldown/Vite 支持的 map compose。
- integration test 浏览器 stack 映射到 `.tsx`。

---

## 10. CSS 编译

### 10.1 目标

用户：

```tsx
import css from './Button.module.css'
```

正常工作。

### 10.2 约束

DSH HMR 会清理：

```html
<style data-plugin="...">
```

因此 DSHX 生成的插件 CSS 必须有稳定 owner marker。

### 10.3 v0.1 实现策略

推荐：

1. 让 Vite 正常完成 CSS Modules class mapping。
2. `cssCodeSplit = false`。
3. 在 bundle generate phase 收集 CSS asset。
4. 删除独立 CSS asset。
5. 在 Client factory 执行时注入：

```js
const tagId = '<plugin-id>'

if (!document.querySelector(`style[data-plugin="${tagId}"]`)) {
  const style = document.createElement('style')
  style.dataset.plugin = tagId
  style.textContent = compiledCss
  document.head.appendChild(style)
}
```

如果一个插件有多个 style source，可以增加：

```text
data-plugin-css="<plugin-id>/<stable-style-id>"
```

但 `data-plugin` 必须存在。

### 10.4 CSS Scope

不默认引入：

- Tailwind。
- CSS-in-JS。
- UI component library。

开发者可以通过普通 Vite plugin 扩展，但 DSHX 不保证所有会产生 runtime singleton 的库都与 DSH Client module contract 兼容。

---

## 11. Client HMR

### 11.1 DSHX 不参与 reload protocol

开发：

```text
source change
   ↓
Vite watch rebuild
   ↓
atomic replace dist/client.js
   ↓
DSH HMR stat detects mtime/size
   ↓
clientModules.rebuilt(id)
   ↓
rev changed
   ↓
SSE rebuilt
```

### 11.2 文件写入

为了避免 DSH 读取半写文件：

- 优先让 bundler使用临时文件 + rename 或确保输出写完整。
- 即便 torn read，DSH HMR 自身下一次 stat/hash 会自愈，但 DSHX 应减少该窗口。

### 11.3 失败行为

如果 Client apply 失败：

- DSH 会保留 FAILED Fiber 状态。
- DSHX 不自动回滚旧 bundle。
- CLI 应读取可获得的 failure diagnostics 并显示。

### 11.4 React State

文档明确：

```text
DSH Client HMR = plugin reload
not React Fast Refresh
```

---

## 12. Host 开发刷新

### 12.1 v0.1 默认

Host source change：

```text
build success
   ↓
CLI mark restart-needed
   ↓
user press r
   ↓
restart DSH process
```

理由：

- Host 可能贡献 Tool / Adapter / Service。
- 在 Agent turn 执行中卸载可能破坏 in-flight capability。
- DSH 官方也避免将 dense source graph 的 module HMR扩大成大范围 Fiber teardown。

### 12.2 后续

只有当 DSH 官方暴露稳定的 single-plugin host reload contract 时，再增加安全 Host HMR。

不要依赖未公开的 Loader internals 自行实现。

---

## 13. `defineSlot()` 设计

### 13.1 类型来源

使用官方：

```ts
SlotMap
PropsRuntime<K>
InjectFace<T>
...
```

不要复制类型。

### 13.2 API

概念：

```ts
type DshxSlotOptions<K extends keyof SlotMap & string> =
  DshSlotRegistrationOptions<K> & {
    component: ComponentType<DshxSlotProps<K, ...>>
    inject?: (ctx: ClientContext, scopeArg?: unknown) => Record<string, unknown>
  }

function defineSlot<K extends keyof SlotMap & string>(
  name: K,
  options: DshxSlotOptions<K>,
): SlotContribution<K>
```

### 13.3 Runtime

`defineClient()` 的 adapter：

```ts
for (const slot of definition.slots) {
  ctx.slots.inject(slot.name, () => {
    const { component, ...registration } = slot.options

    return ctx.slots.register(
      {
        name: slot.name,
        ...registration,
      },
      component,
    )
  })
}
```

### 13.4 不做的事情

- 不创建新的 Slot tree。
- 不推断用户未声明的 `key`。
- 不把 ctx 传入 component。
- 不把 Slot owner props 复制成 DSHX 自有 schema。
- 不绕过 `slots.inject()` 直接假设声明已经存在。

---

## 14. Slot Scaffold 与类型导入

动态 Composition 带来一个问题：

Runtime Inspect 能告诉我们 Slot 存在，但 TypeScript declaration merging 仍需要拥有该 Slot 的 package types 进入编译图。

因此 `dshx add ui` 推荐流程：

```text
inspect slot
    ↓
获取 provider package
    ↓
写入 type-only import
    ↓
官方 SlotMap augmentation 生效
    ↓
defineSlot<K> 得到精确类型
```

生成示例：

```ts
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { defineSlot } from 'dshx/client'
```

这是比“运行时 JSON → 自己生成完整 Props 类型”更可靠的方案。

---

## 15. `defineTool()` 与 Tool 类型

优先：

- 直接 re-export DSH 官方 `defineTool`。
- 如果 DSH 版本没有适合外部使用的 `defineTool` export，再提供版本适配器，但返回类型必须兼容官方 `ToolDefinition`。

禁止：

```text
DshxTool
→ runtime convert
→ DshTool
```

长期存在两套模型。

---

## 16. Settings 设计（P1）

官方 Settings 是 Host + Client 双半侧能力。

DSHX 可以做的抽象：

```ts
const settings = defineSettings({
  namespace: 'weather',
  schema,
})
```

Host adapter：

```text
installSettingsSection(...)
```

Client adapter：

- 默认表单（只覆盖可自动渲染 schema）。
- 或 `defineSettingsView()` 注册 `settings.plugin.item`。

必须保留：

- namespace。
- secret role。
- restart applies。
- revision gate。
- user/base/value 层语义。

如果 Helper 不能完整表达以上语义，则退回 scaffold。

---

## 17. Conversation Node（P1）

### 17.1 简单 Helper 范围

只允许处理：

```text
single durable event
→ independent node
```

可提供：

```ts
defineEventNode({
  event,
  key,
  location,
  component,
})
```

### 17.2 超出范围

任一条件出现即使用官方 `ConversationNodeDefinition` scaffold：

- 多事件 start/update/end。
- delta fold。
- pending Context。
- older pagination。
- previous Context dependency。
- animation-frame publication。
- location data sharing。
- terminal fallback。

不要在 Helper 内隐藏 replay 逻辑。

---

## 18. Inspect 架构

### 18.1 数据源优先级

```text
running DSH inspect provider
        ↓
generated official catalog
        ↓
installed package static metadata
```

运行时数据是当前 Composition 真值。

### 18.2 Inspect Adapter

```ts
interface InspectProvider {
  listServices(): Promise<ServiceSummary[]>
  listEvents(): Promise<EventSummary[]>
  listSlots(): Promise<SlotSummary[]>
  listTools(): Promise<ToolSummary[]>
}
```

DSHX 自己只定义通用展示 DTO，不定义 DSH Service/Slot runtime 类型。

### 18.3 Cache

开发期可缓存：

```text
.dshx/cache/catalog.json
```

必须记录：

```json
{
  "dshVersion": "...",
  "profile": "web",
  "generatedAt": "...",
  "source": "runtime"
}
```

版本/Profile 变化自动失效。

---

## 19. `dshx add`

Scaffold generator 应基于模板 AST 或结构化字符串，不应依靠不可控的 LLM 生成。

### `add tool`

生成：

```text
src/tools/<name>.ts
```

并修改 `src/host.ts` 的显式 imports / `tools` array。

### `add ui`

1. Inspect Slots。
2. 用户选择。
3. 生成 Component。
4. 生成 provider `import type {}`。
5. 修改 `src/client.tsx` 的 slots array。
6. 如果项目此前无 Client：
   - 创建 `src/client.tsx`。
   - 显式更新 package exports。
   - 显式加入 `dsh.client`。
   - 提示用户发生了哪些 manifest 修改。

### `add hook`

生成原生：

```ts
setup(ctx) {
  ctx.on(...)
}
```

不能创造 file-name event magic。

---

## 20. Manifest 与 Package

### 20.1 Full Plugin Template

概念：

```json
{
  "name": "dsh-example",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/client.js",
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./package.json": "./package.json"
  },
  "files": [
    "dist",
    "cordis.patch.yml"
  ],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    },
    "client": {
      "platform": "web",
      "inject": [],
      "immediately": false
    }
  }
}
```

实际字段必须由 compat adapter 对目标版本验证。

### 20.2 Client-only Source

由于 DSH Client plugin 仍是 Loader entry/package，DSHX 为无用户 Host 源码的项目构建一个 no-op Node half：

```ts
export function apply() {}
```

这样 package 仍有统一 Host Loader entry。

### 20.3 `dsh.client.inject`

不要简单等于 Source Code 的 Cordis `inject`。

初期策略：

- baseline platform modules 不写。
- 非 baseline DSH dynamic value imports 由 build analyzer 收集。
- 根据目标版本规则生成候选 package dependency edges。
- `dshx check` 与 manifest 比对。
- v0.1 若无法可靠推断，要求显式 manifest 并只做验证。

优先正确，避免“自动推断错依赖”。

---

## 21. Profile Orchestrator

`dshx dev`：

```text
resolve target profile
      ↓
check whether project is linked
      ↓
if absent:
  dsh plugin --profile <profile> add <absolute-project-path>
      ↓
launch dsh --profile <profile>
```

不要：

- 手工改 `$DSH_HOME/profiles/.../package.json`。
- 手工维护 `dsh.profile.bundles`。
- 自己运行 pnpm reconciliation。

### 重复执行

需要 idempotent：

- 已 link 当前项目时不重复 add。
- package name/path 变化时给明确提示。
- dev process 退出不自动 remove plugin；这样下一次启动更快。
- 提供显式 `dshx unlink` 前应确认是否需要；v0.1 可以不提供。

---

## 22. Process Orchestrator

`dshx dev` 进程组成：

```text
Parent CLI
├── Host build watcher
├── Client build watcher
└── DSH child process
```

状态机：

```ts
interface DevState {
  hostBuild: 'idle' | 'building' | 'ok' | 'error'
  clientBuild: 'idle' | 'building' | 'ok' | 'error'
  hostRestartRequired: boolean
  dshProcess: 'stopped' | 'starting' | 'running' | 'failed'
}
```

输入：

```text
r   restart DSH
q   quit
```

终端不要刷屏。

默认只显示：

- first build。
- error。
- successful client rebuild。
- host restart needed。
- DSH process exit。

Verbose 模式再显示完整 compiler / Cordis logs。

---

## 23. Diagnostics

统一异常模型：

```ts
class DshxError extends Error {
  code: string
  hint?: string
  file?: string
  cause?: unknown
}
```

典型检测：

### Client Node builtin

构建 resolve hook：

```text
client graph → node:fs
```

立即 DSHX1201。

### Duplicate React

如果 React 没被 external：

- build invariant fail。
- bundle test 检测不存在 React implementation bytes / known imports。

### Unsupported DSH

在 build/dev 最早阶段检测。

### Slot unavailable

在线 inspect 下 check。

### Client bundle malformed

Smoke parser 验证：

- 调用 `window.__ModuleLoader__.load`。
- id 匹配 package。
- factory 返回 plugin object。
- no unresolved browser globals (在受控 fixture 中)。

---

## 24. 版本兼容层

```text
compat/
├── index.ts
└── 0.1.0-rc.8.ts
```

解析：

```ts
resolveCompatibility(installedDshVersion)
```

支持状态：

```text
verified
compatible-range
unsupported
```

RC 阶段默认只对明确验证版本标 `verified`。

每个 adapter 需要测试：

- platform external list。
- client manifest rules。
- bundle wrapper。
- package export rules。
- profile install smoke。

---

## 25. 测试架构

### 25.1 Compiler Unit

Host：

- virtual entry。
- no-op host。
- external。

Client：

- wrapper。
- module `require`。
- JSX。
- CSS Modules。
- sourcemap。
- no chunks。
- Node builtin rejection。

### 25.2 Runtime Unit

使用最小 fake Context：

- `defineHost({ tools })` 确实调用 `ctx.tools.register`。
- `defineClient({ slots })` 确实执行 `slots.inject/register`。
- inject union 正确。
- setup 顺序正确。

不要 fake Agent / Session Runtime。

### 25.3 End-to-End

真实 DSH 安装。

Fixture：

```text
fixtures/full/
├── src/host.ts
├── src/client.tsx
├── src/Button.module.css
├── package.json
└── cordis.patch.yml
```

E2E 步骤：

1. `dshx build`。
2. link profile。
3. `dsh --profile web --dump-config`。
4. 启动 DSH web。
5. 浏览器打开。
6. 检查 plugin Client Fiber mounted。
7. 检查 Slot UI。
8. 改 source。
9. watcher rebuild。
10. 等待 `/plugins/events` rebuilt。
11. 检查 Fiber reload。
12. 检查新 UI。
13. 检查没有重复 style tag。
14. 检查 Session object / page shell 未整体重载。

建议 Playwright 只用于真正浏览器层，普通逻辑使用 Vitest。

---

## 26. Phase A 详细实施计划

这是 Agent 首先执行的工作，不允许同时开始高级 Helper。

### A1 建最小外部 DSH fixture

手写当前官方 Client factory，确认环境可加载。

### A2 用 Vite 生成相同语义

输入：

```tsx
export function Demo() {
  return <div className={css.demo}>hello</div>
}
```

输出合法 `client.js`。

### A3 External

确认 bundle 不包含：

```text
React implementation
Cordis implementation
DSH runtime implementation
```

### A4 Slot

使用一个当前 web profile 稳定存在的 additive slot。

不要选择 `root`。

### A5 CSS

确认：

```text
style[data-plugin="<id>"]
```

存在。

### A6 HMR

启动 build watch。

改 TSX。

必须观察：

```text
client.js mtime/hash change
DSH rebuilt SSE
Fiber reload
DOM update
```

### A7 Source Map

主动抛一个 Client error，stack 定位到 TSX。

### Phase A Exit Criteria

全部通过后才能开始：

```text
defineHost
defineClient
defineSlot
create-dshx
```

---

## 27. v0.1 实施顺序

```text
1. compat rc.8
2. client compiler
3. Phase A E2E
4. host compiler
5. config resolver
6. manifest checker
7. profile orchestrator
8. dev process manager
9. defineHost
10. defineTool integration
11. defineClient
12. defineSlot
13. create-dshx
14. dshx check
15. basic inspect
16. add tool/ui/hook
17. docs + fixtures
```

如果某一步暴露 DSH contract 与设计不一致，回到前面的技术层修正，不通过增加高层 abstraction 掩盖。

---

## 28. 明确延后或禁止实现

### v0.1 禁止

- React Fast Refresh 注入真实 DSH 页面。
- Module Federation。
- DSHX 自己的 Service Container。
- DSHX Session Store。
- DSHX Agent handle。
- 自动 AST 改写所有 `ctx.<service>` → `inject`。
- file-based Event magic。
- Slot DOM selector patch。
- 重写 DSH Profile loader。
- 自定义 Client RPC 协议。

### 研究后再决定

#### Static plugin-private RPC

DSH Dynamic Cordis Plugin 已有 package-private `harness.handle` / `host.call` 思路，但它属于 Dynamic Plugin Runner 环境。

不能直接假定静态 out-of-tree bundle 可以复用。

实现 `definePluginApi()` 前必须确认：

- 静态 package 官方推荐的 private Host↔Client seam。
- 生命周期。
- Session scope。
- serialization。
- authorization。
- reconnect。

在验证前只提供原生 DSH Remote / Service scaffold。

---

## 29. 安全与稳定性

- 不执行来自 Inspect 的任意代码。
- Package path 使用 realpath，避免越界写入。
- `dshx add --fix` 修改文件前生成 diff / backup strategy。
- Build 输出目录不得覆盖用户源码。
- Profile 操作只调用官方 CLI。
- 不将 `.env` secret 打进 Client bundle。
- Client 读取的环境变量必须明确视为 public build-time value。
- Secret Settings 不得进入 Client Snapshot。
- Unsupported DSH 版本 fail early。

---

## 30. 性能目标

初始构建：

- 以正确性优先。
- 小型 Client plugin 构建应保持在开发可接受范围。

增量 Client build：

- 只 rebuild 受影响 Client graph。
- 不重启 DSH。
- DSH HMR 默认 stat interval 当前约 500ms，DSHX 不再叠加额外 poll loop。

Bundle：

- single-file client v0.1。
- shared platform modules external。
- third-party ordinary implementation libraries可以私有 bundle，但必须通过 Client purity rules。

---

## 31. 文档体系

用户文档按任务排序：

```text
Getting Started
├── First Tool
├── First React UI
├── Tool + UI
├── Settings
├── Agent Hooks
└── Conversation Nodes

Concepts
├── Host vs Client
├── Tool
├── Slot
├── Session
├── Agent
└── Cordis

Reference
├── CLI
├── dshx/host
├── dshx/client
├── config
└── compatibility
```

不要把 Cordis/Fiber 作为 Getting Started 前置阅读。

---

## 32. 代码质量要求

- TypeScript strict。
- Public API 有类型测试。
- Compiler transformation 有 snapshot / fixture test。
- 不允许 `any` 穿过 Public API。
- Compat 常量集中。
- DSH path/string 不散落。
- 每个 `dshx` error 有 code。
- 所有 subprocess 明确处理 signal / exit code。
- dev exit 时停止 watcher 和 child process。
- Windows path 作为后续兼容目标时不能依赖 POSIX 字符串拼接；从第一版使用 Node path API。

---

## 33. Agent 每阶段交付物

每个阶段 Agent 必须提交：

1. 代码。
2. 对应自动化测试。
3. 一个最小 fixture。
4. `DECISIONS.md` 中新增或修改的架构决策。
5. 与目标 DSH 版本的验证结果。
6. 已知限制。

Agent 不得只交“架构代码”而没有真实 DSH smoke。

---

## 34. Definition of Done：v0.1

以下全部成立才能标记 v0.1：

```bash
pnpm create dshx demo
cd demo
pnpm dev
```

无需手工编辑 DSH 配置即可启动。

Host：

- Tool 能注册并被 Agent 使用。
- 高级用户可以 `setup(ctx)`。

Client：

- TSX 正常。
- CSS Modules 正常。
- Slot 正常。
- 使用 DSH React identity。
- Source Map 正常。
- 修改 TSX 自动触发 DSH native HMR。

Build：

- `dshx build` 可生成可安装 package 产物。
- `dshx check` 无错误。
- `dsh --profile web --dump-config` 能看到 plugin layer。

DX：

- Client bundle 中没有用户手写 ModuleLoader。
- 新人无需理解 Profile/Bundle 才能运行。
- 错误能指出文件和修复动作。
- 未支持 DSH 版本明确拒绝或警告。
- 没有第二套 Agent/Session/Slot runtime。

---

## 35. 官方源码核对清单

每次升级 DSH compat adapter 时核对：

### Cordis / 生命周期

- `docs/cordis-primer.md`
- vendored Cordis Loader / Fiber lifecycle（只读验证，不复制公开 API）

### Architecture / Profile

- `docs/architecture.md`
- `packages/boot/app-boot/`
- `apps/cli/src/plugin.ts`

### Client module contract

- `packages/client/modules/`
- `packages/client/web/src/platform.ts`
- `packages/client/tsdown.client.ts`

### Client HMR

- `packages/client/hmr/README.md`
- `packages/client/hmr/src/`

### React / Slot

- `packages/client/AGENTS.md`
- `packages/client/runtime/`
- `packages/client/ui-renderer/`
- `packages/client/ui-slots/`

### Higher-level extension points

- `docs/cookbook/adding-a-settings-card.md`
- `docs/cookbook/adding-a-conversation-node.md`
- `docs/cookbook/extension-cookbook.md`
- generated subsystem/catalog docs

任何设计与当前源码冲突时，以目标 DSH 版本的公开实现和官方文档为准，并更新 compat adapter，不通过增加隐藏补丁维持旧假设。
