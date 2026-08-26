# DSHX 产品需求文档（PRD）

> **历史基础文档（已由 0.1.2 API Candidate 文档取代）：** 本文保留最初的产品边界与背景，不再作为当前 API 的开发指引。请从 [`docs/index.md`](docs/index.md) 进入分章 API 文档，并使用 [`docs/migrations/0.1.1-to-0.1.2.zh-CN.md`](docs/migrations/0.1.1-to-0.1.2.zh-CN.md) 迁移旧示例。

> 文档状态：Draft for implementation  
> 目标版本：v0.1 → v0.3  
> DSH 基线：DeepSeek Harness `0.1.0-rc.8`（以 2026-08-21 官方 `master` 为设计基线）  
> 面向对象：实现 DSHX 的 Coding Agent、维护者、插件开发者  
> 核心原则：**DSHX 负责开发体验，DSH / Cordis 负责运行语义。**

---

## 1. 产品定义

DSHX 是面向 DeepSeek Harness（DSH）插件生态的 TypeScript / React 开发工具链。

它的目标是让开发者以接近普通 TypeScript / React 项目的方式开发 DSH 插件，隐藏 Client Bundle、Profile/Bundle、本地联调、构建、CSS、模块 external、HMR 接入等工程复杂度，同时保留 DSH 原生 `Context`、Service、Event、Agent、Session、Tool、Slot 等能力作为高级扩展入口。

DSHX 不建立新的 Agent Runtime、Session Runtime、Tool Runtime、UI Runtime 或插件生命周期。所有最终运行语义必须落到 DSH / Cordis 官方能力。

期望体验：

```bash
pnpm create dshx my-plugin
cd my-plugin
pnpm dev
```

开发者可以直接编写：

```ts
// src/host.ts
import { defineHost, defineTool } from "dshx/host";

const hello = defineTool({
  name: "hello",
  description: "Say hello",
  parameters: {
    name: { type: "string", required: true },
  },
  async execute({ name }) {
    return { message: `Hello ${name}` };
  },
});

export default defineHost({
  tools: [hello],
});
```

以及：

```tsx
// src/client.tsx
import { defineClient, defineSlot } from "dshx/client";

const status = defineSlot("sidebar.footer.action", {
  component: StatusButton,
});

function StatusButton() {
  return <button>DSHX</button>;
}

export default defineClient({
  slots: [status],
});
```

开发者无需直接处理 DSH Client 的 lazy-CJS factory、`window.__ModuleLoader__`、构建 external、CSS 生命周期、Profile link 和本地 Client HMR。

---

## 2. 背景与问题

DSH 的 Runtime 扩展能力已经较完整，但外部插件开发目前存在明显工程门槛。

当前官方模型中，插件作者需要理解或手工处理的内容包括：

- Cordis `Context` / Service / `inject` / Fiber / Effect 生命周期。
- DSH Host Plugin 与 Client Plugin 的不同运行环境。
- `package.json` 中 `dsh.bundle`、`dsh.client` 等元数据。
- Bundle / Profile / `cordis.patch.yml` 的组合关系。
- Client 插件 `./client` 特殊产物。
- DSH Client Module Loader 所要求的 lazy-CJS factory 格式。
- React、Cordis、Client Runtime 等共享模块 external。
- CSS Modules、样式注入和 Client Fiber 卸载时的样式清理。
- Slot 的 `single` / `list` / `keyed` / `chain` 协议。
- Session Scope / Global Scope 下不同的 React 标准 Props。
- Client HMR 与 Cordis Fiber 的重挂逻辑。
- 不同 DSH RC 版本中 Client API 和插件构建协议的变化。

官方仓库内部已有 `clientBundle()` tsdown preset 解决 Client Bundle 生产问题，但当前未作为稳定的外部插件构建 API 发布；仓库外插件需要自行复刻该输出格式。

DSH 自身已经具备 Client Module Loader 和 Client HMR。外部构建器只要持续重写合法的 `client.js`，DSH HMR Node Half 会 stat-poll 图中的 bundle，检测 content hash 变化并通过 `/plugins/events` 广播 `rebuilt`，Browser Half 再执行 `invalidate → prefetch → Fiber dispose → entry.refresh()`。因此 DSHX 不应建立第二套浏览器插件 HMR 协议。

---

## 3. 目标用户

### 3.1 第一次开发 DSH 插件的开发者

特点：

- 会 TypeScript 或 JavaScript。
- 可能不了解 Cordis。
- 希望先完成 Tool 或简单 UI。
- 不希望先学习 Profile、Bundle、Fiber、Module Loader。

目标：

- 5 分钟创建项目。
- 15 分钟完成一个 Tool 或 React UI。
- 错误信息能直接指出业务层修复动作。

### 3.2 React 开发者

特点：

- 熟悉 React / TSX / CSS Modules。
- 希望组件保持普通 React 心智模型。
- 不希望手工编写 Client Loader factory 和 Slot 装配样板。

目标：

- 正常编写 TSX。
- 使用 DSH 官方 Slot 提供的标准 Props / Hooks。
- 使用 CSS Modules。
- Client 改动自动触发 DSH 原生 HMR。

### 3.3 DSH 高级插件作者

特点：

- 需要 Agent Event、Tool Pipeline、System Prompt、Session Event、Conversation Node、Service 等能力。
- 理解 `ctx` 和 Cordis 生命周期。
- 不接受被高层 DSL 限制。

目标：

- `setup(ctx)` 能直接使用完整 DSH / Cordis API。
- DSHX 不阻断新的官方能力。
- 可以逐步绕过所有 Shortcut。

### 3.4 插件维护者

特点：

- 关注版本兼容、发布、测试和故障定位。
- 需要知道当前插件依赖了哪些 Service、Slot 和 Client 模块。

目标：

- `dshx check` 能做静态工程校验。
- `dshx inspect` 能发现当前 Composition 的真实扩展点。
- 未支持的 DSH 版本明确报错或警告。

---

## 4. 产品目标

### 4.1 核心目标

1. **零或低配置启动**
   - `src/host.ts` 和 `src/client.tsx` 是默认稳定入口。
   - `dshx.config.ts` 只描述例外。
   - 不要求用户手写 Vite 配置。

2. **React 一等支持**
   - TSX。
   - CSS Modules。
   - Source Map。
   - React 与 DSH Web Shell 共享同一运行时模块身份。
   - UI 通过 DSH Slot 系统挂载。

3. **完整访问 DSH 能力**
   - 高频能力提供 Shortcut。
   - 复杂能力提供 Scaffold / Inspect / 类型辅助。
   - 所有能力最终可通过原生 `ctx` 使用。

4. **复用 DSH 生命周期**
   - Client HMR 复用 DSH 原生 HMR。
   - Plugin Dispose 复用 Cordis Fiber / Effect。
   - Profile 安装复用官方 `dsh plugin --profile ...`。

5. **强可发现性**
   - 开发者能够发现当前 Composition 实际存在的 Service / Event / Slot / Tool。
   - `dshx add` 根据真实扩展点生成原生 DSH 代码。

6. **错误在开发者熟悉的层次表达**
   - 尽量不要直接暴露 Rolldown、Module Loader 或 Cordis 内部栈作为第一错误信息。
   - 错误必须附带修复方向。

### 4.2 非目标

DSHX v0.x 不负责：

- 实现新的 Agent Runtime。
- 实现新的 Session Store。
- 包装 `ctx.agents` 为 `dshx.agent`。
- 包装 `ctx.sessions` 为 `dshx.sessions`。
- 实现独立 Tool Registry。
- 实现独立 Slot Registry。
- 实现独立 React Context 让业务组件直接读取 Client `ctx`。
- 在真实 DSH 页面中建立第二套 Vite HMR / React Fast Refresh 生命周期。
- 自动把所有 Event 转成 `beforeXxx()` / `afterXxx()`。
- 根据文件名自动猜 Event、Slot、Service。
- 自动修改用户 `inject` 语义。
- 承诺兼容所有未来 DSH RC 版本。

---

## 5. 初学者心智模型

第一阶段只向新用户介绍三个概念：

### Tool

“让模型可以调用一个能力。”

```ts
defineTool(...)
```

### Hook / Event

“在 Agent 或 Tool 执行过程中的某个阶段参与处理。”

```ts
setup(ctx) {
  ctx.on('agent/request', ...)
}
```

### UI

“把 React 组件挂到 DSH 已有界面的一个扩展位置。”

```tsx
defineSlot(...)
```

第二阶段再引入：

- Host。
- Client。
- Session。
- Agent。
- System Prompt。

第三阶段再引入：

- Context。
- Service。
- `inject`。
- Effect。
- Fiber。
- Waterfall。
- Conversation replay。

---

## 6. 核心设计原则

### P-01 渐进式暴露

同一个插件应能从：

```ts
defineHost({ tools: [tool] });
```

成长到：

```ts
defineHost({
  tools: [tool],
  inject: ['agents'],
  setup(ctx) {
    ctx.on(...)
  },
})
```

高级用户不需要离开 DSHX，也不需要迁移到另一套工程。

### P-02 Shortcut 必须能还原到官方 API

所有 Shortcut 都必须可以清晰说明底层等价操作。

例如：

```ts
tools: [tool];
```

等价于在插件生命周期中注册：

```ts
ctx.tools.register(tool);
```

`defineSlot()` 等价于：

```ts
ctx.slots.inject(name, () => ctx.slots.register(options, Component));
```

### P-03 不隐藏关键运行语义

以下语义不得被伪装成简单 DSL：

- Waterfall `next()`。
- Event 短路。
- Agent turn / step。
- Conversation Node replay。
- Service required / optional。
- Slot kind / scope。
- Session durable event。

### P-04 文件约定只用于稳定边界

允许：

```text
src/host.ts
src/client.tsx
```

不默认采用：

```text
src/events/agent-request.ts
src/slots/sidebar.tsx
```

来推导运行语义。

### P-05 Import 应表达运行环境

推荐：

```ts
import { defineHost } from "dshx/host";
import { defineClient, defineSlot } from "dshx/client";
```

不在 v0.x 提供全局 Auto Import。

### P-06 组件不直接持有 Client Context

遵循 DSH Client UI 架构：

- `ctx` 属于 Client Plugin `apply/setup` 世界。
- React 业务组件通过 Slot standard props、owner props、injected callbacks、store/projection hooks 接收能力。
- DSHX 不引入 `<DshProvider>` + `useDsh()` 重新打通 `ctx → Component`。

---

## 7. 项目结构

### 7.1 最小项目

```text
my-plugin/
├── src/
│   ├── host.ts
│   └── client.tsx
├── package.json
├── tsconfig.json
└── README.md
```

### 7.2 成长后的推荐结构

```text
src/
├── host.ts
├── client.tsx
├── tools/
├── hooks/
├── components/
├── conversation/
├── settings/
└── shared/
```

目录只作为代码组织建议，不自动改变 DSH 语义。

---

## 8. CLI

公开 CLI 控制在以下命令：

```bash
dshx dev
dshx build
dshx check
dshx inspect
dshx add
```

脚手架：

```bash
pnpm create dshx
```

### 8.1 `dshx dev`

职责：

- 检查 Node / DSH / package 元数据。
- 构建 Host。
- 构建 Client。
- 将本地插件安装 / link 到开发 Profile。
- 启动 DSH。
- 启动增量构建 watcher。
- 展示 Client reload 和 Host restart 状态。
- 收敛错误信息。

默认 Profile：

- 只要存在 Client Entry，默认 `web`。
- Host-only 项目默认仍优先使用 `web` 作为开发 Profile，除非显式指定其他 Profile，避免不同 surface 能力差异增加新手心智成本。
- 可以通过 `dshx.config.ts` 覆盖。

Host 改动默认行为：

- 构建成功后提示 `press r to restart host`。
- 不在 v0.1 默认自动重启正在运行的 DSH。
- 提供显式配置 `dev.hostRestart = 'auto' | 'manual'`，默认 `manual`。

### 8.2 `dshx build`

职责：

- 生产 Host ESM。
- 生产 DSH Client lazy-CJS factory。
- 生成 sourcemap。
- 生成 / 校验 `cordis.patch.yml`。
- 验证 package exports 和 `dsh.*` 元数据。
- 执行兼容性检查。

### 8.3 `dshx check`

至少检查：

- DSH 版本。
- Node 版本。
- Host/Client entry 是否存在。
- Root `package.json` 与项目模式是否一致。
- Client 是否声明 `./client`。
- Client 是否声明 `dsh.client`。
- Bundle 是否声明 `dsh.bundle`。
- Client 是否错误引用 Node builtin。
- 共享模块 external 是否正确。
- 未声明的明显 Service hard dependency。
- Slot 是否可在当前 Composition 中找到（在线模式）。
- 产物是否能被 DSH Client Loader 识别。

`--fix` 只修复确定性的工程元数据，不自动修改业务语义。

### 8.4 `dshx inspect`

目标：

```bash
dshx inspect services
dshx inspect events
dshx inspect slots
dshx inspect tools
```

优先复用 DSH 自己的 Runtime Inspect / Catalog 能力。

示例：

```text
conversation.input.plan
  kind: single
  scope: session
  provider: @deepseek-ai/dsh-client-ui-conversation
```

### 8.5 `dshx add`

示例：

```bash
dshx add tool
dshx add ui
dshx add hook
dshx add command
dshx add settings
dshx add conversation-node
dshx add service
dshx add subagent
dshx add llm-adapter
```

原则：

- 生成官方 API 骨架。
- 不为复杂 API 强行设计 DSL。
- `dshx add ui` 应优先查询当前 Slot Catalog，再让用户选择扩展点。
- 如果新增 Client Half 到原 Host-only package，可以显式更新 `package.json` 的 `dsh.client` 与 `./client` export。

---

## 9. 公共 API

v0.1 首批 API 控制在小范围。

### `dshx/host`

```ts
defineHost();
defineTool();
```

`defineTool()` 优先 re-export / 适配 DSH 官方 Tool 定义，不建立第二种 Tool 类型。

### `dshx/client`

```ts
defineClient();
defineSlot();
```

### `dshx/config`

```ts
defineConfig();
```

### 后续按真实重复度增加

候选：

```text
defineToolView()
defineCommand()
defineSettings()
defineEventNode()
```

只有满足以下条件才允许新增 Shortcut：

1. 存在大量真实重复代码。
2. 底层 DSH 语义稳定。
3. Shortcut 不改变语义。
4. DSH 新增官方 Helper 后可以低成本删除这一层。

---

## 10. Host 功能需求

### FR-HOST-01 `defineHost`

基本 API：

```ts
export default defineHost({
  name?: string,
  inject?: string[],
  tools?: ToolDefinition[],
  setup?: (ctx) => void | Promise<void>,
})
```

要求：

- `name` 默认来自 package name / DSHX config。
- `tools` 自动注册到 `ctx.tools`。
- 如果使用 `tools`，框架自动追加 `tools` Cordis hard dependency。
- `inject` 去重。
- `setup(ctx)` 获得原始 DSH / Cordis Context。
- 注册顺序确定且可测试。
- Dispose 由 DSH/Cordis 原生生命周期负责。

### FR-HOST-02 Tool

必须支持：

- Tool schema。
- Typed args。
- Async execute。
- DSH Tool Output。
- 官方 `timeoutMs` / concurrency / presentation 等高级属性不能被丢失。
- 用户可以完全绕过 Shortcut 使用 `ctx.tools.register()`。

### FR-HOST-03 Agent / Tool Event

v0.1 不创建 `onBeforeRequest()` DSL。

提供：

- `dshx inspect events`。
- `dshx add hook`。
- TypeScript 类型。
- Waterfall 诊断。
- 对明显忘记返回 / await `next()` 的情况提供 lint 或开发期提示（能可靠检测时）。

### FR-HOST-04 System Prompt

P1。

高频场景可以增加薄 Shortcut，但原生 `ctx.systemPrompt` 必须始终可用。

### FR-HOST-05 Command

P1。

如果官方 Command API 稳定且样板高度重复，增加 `defineCommand()`。

### FR-HOST-06 Session / Agent / Service

不包装 Domain API。

开发者直接使用：

```text
ctx.sessions
ctx.agents
ctx.<service>
```

DSHX 提供：

- 类型。
- Inspect。
- Scaffold。
- 依赖诊断。

---

## 11. Client / React 功能需求

### FR-CLIENT-01 普通 React 构建

支持：

- TSX。
- React 18 当前 DSH 共享运行时。
- JSX Runtime external。
- CSS Modules。
- 普通 CSS。
- Source Map。
- Assets（v0.1 可限制在静态内联或明确支持的类型，未支持类型必须 fail loud）。

### FR-CLIENT-02 `defineClient`

示例：

```tsx
export default defineClient({
  inject?: ['remote'],
  slots: [
    status,
    toolView,
  ],
  setup?(ctx) {
    // 原始 Client Context
  },
})
```

要求：

- 有 Slot 时自动声明 Cordis `slots` Service dependency。
- `setup(ctx)` 获得原始 `ClientContext`。
- Client Plugin 的 Cordis Service `inject` 与 `package.json dsh.client.inject` 必须在类型和配置中明确区分。

### FR-CLIENT-03 `defineSlot`

示例：

```tsx
const status = defineSlot("sidebar.footer.action", {
  component: StatusButton,
});
```

要求：

- 使用 DSH 官方 `SlotMap` 类型。
- 保留 DSH 的 `key` / `id` / `priority` / `select` / `inject` 等真实字段。
- 根据 Slot 类型尽可能进行编译期约束。
- 内部实现最终必须调用 `ctx.slots.inject()` + `ctx.slots.register()`。
- 组件使用 DSH 官方 Props Runtime。
- 不把 `ctx` 直接注入 React Component。

### FR-CLIENT-04 Slot 类型发现

v0.1：

- 优先使用安装的 DSH TypeScript declarations。
- `dshx add ui` 根据 Inspect 结果生成所需的 `import type {}`，触发官方 declaration merging。
- 不尝试从运行时 JSON Schema 重新合成完整的复杂 TypeScript Slot Props。

P1/P2：

- 可生成 `.dshx/catalog.d.ts` 作为 Slot 名称、Provider、元数据的 IDE 提示。
- 不复制官方 Slot 类型定义作为新的真源。

### FR-CLIENT-05 Tool View

P1 Shortcut：

```tsx
defineToolView({
  tool: "weather",
  component: WeatherCard,
});
```

底层映射到官方 Tool View Slot。

### FR-CLIENT-06 Settings

P1。

目标：消除官方 Host Namespace + Client Settings Card 的大量样板。

要求：

- 默认表单仅在 Schema 能可靠映射到 UI 时生成。
- 自定义 Settings UI 始终可用。
- Secret / restart semantics 不得被丢失。
- Host / Client namespace 必须使用同一个稳定 key。

### FR-CLIENT-07 Conversation Node

两档支持：

1. 简单 durable event → one view node，可提供 `defineEventNode()`。
2. start/progress/end、分页、Replay、Location Data 等复杂情况，仅提供 Scaffold 和官方 `ConversationNodeDefinition`。

不得隐藏：

- stable business id。
- replay。
- event `seq`。
- start/update 关系。
- publication。
- pagination。

### FR-CLIENT-08 Projection

P1/P2。

优先通过官方 Session Projection 体系和 Slot `useProjection` 提供类型辅助。

初期可以只做 Scaffold，不创建新的 Projection Runtime。

### FR-CLIENT-09 Theme

P1/P2。

优先提供 Inspect 和 Scaffold。只有官方 Theme API 在外部插件场景稳定后再决定是否增加 `defineTheme()`。

---

## 12. 构建需求

### FR-BUILD-01 Host

- 输入：`src/host.ts` 或虚拟 no-op host。
- 输出：Node ESM。
- 不打包 Node builtin。
- 尊重 package dependencies / peer dependencies。
- 输出稳定 `dist/index.js`。
- Source Map 可配置。

### FR-BUILD-02 Client

必须输出 DSH 可直接加载的单文件 Client Bundle：

```js
window.__ModuleLoader__.load({
  id: "<package-id>",
  factory(require) {
    const module = { exports: {} };
    const exports = module.exports;

    // compiled CJS body

    return module.exports;
  },
});
```

实现要求：

- Client bundle 使用 DSH 的 Module Table `require`。
- React / JSX Runtime / Cordis / DSH 平台共享模块不得被重复 bundle。
- v0.1 Client Bundle 采用 single-file，禁止或内联 dynamic chunks。
- 产物必须附带 sourcemap。
- DSH Client Module Loader 能通过 `exports["./client"]` 解析到该文件。

### FR-BUILD-03 CSS

- Vite CSS Modules 语义保持正常。
- CSS 进入插件生命周期拥有的 `<style data-plugin="...">`。
- Client Fiber HMR 后旧 style 能被 DSH HMR 清理。
- 避免产生 DSH 不知道如何加载的独立 CSS chunk。

### FR-BUILD-04 Client HMR

真实 DSH 联调不使用 Vite dev-server HMR。

流程：

```text
Vite/Rolldown build --watch
        ↓
重写 dist/client.js
        ↓
DSH HMR node half stat-poll bundle
        ↓
content rev change
        ↓
/plugins/events -> rebuilt
        ↓
DSH browser HMR
        ↓
invalidate / prefetch / Fiber remount
```

DSHX 不向 Host 增加额外 `POST /rebuilt` 协议。

### FR-BUILD-05 React Fast Refresh

真实 DSH 联调 v0.x 不保证 React local state preservation。

后续可独立提供：

```bash
dshx ui
```

作为纯组件 Playground：

- Vite Dev Server。
- React Fast Refresh。
- Mock Slot Props。

该模式与真实 DSH Runtime 联调隔离。

---

## 13. Profile / Bundle / 本地开发

### FR-PROFILE-01 Bundle 元数据

脚手架应一次性生成正确的：

- `exports["."]`
- `exports["./client"]`（有 Client 时）
- `exports["./cordis.patch.yml"]`
- `dsh.bundle.patch`
- `dsh.client`（有 Client 时）

开发过程中不要每次静默 rewrite `package.json`。

### FR-PROFILE-02 本地 Profile Link

复用官方：

```bash
dsh plugin --profile <profile> add ./path
```

DSHX 不自行实现 Profile package manager 和 bundle reconciliation。

### FR-PROFILE-03 Patch

简单插件的 patch 可由脚手架生成：

```yaml
- insert:
    - id: <stable-id>
      name: <package-name>
```

复杂 patch 允许用户自定义。

不能通过 DSHX 配置 DSL 完全取代 `cordis.patch.yml`。

---

## 14. Inspect 与可发现性

### FR-INSPECT-01 Capability Catalog

至少覆盖：

- Services。
- Events。
- Slots。
- Tools。

后续：

- Theme Tokens。
- Projections。
- Commands。
- Client dependencies。

### FR-INSPECT-02 Scaffold from Catalog

`dshx add ui`：

1. 连接当前开发 DSH。
2. 获取 Slot tree。
3. 按产品区域展示。
4. 用户选择 Slot。
5. 获取 Provider / package。
6. 生成 type-only import。
7. 生成 `defineSlot()` 或原生 Slot registration。
8. 运行 `dshx check`。

### FR-INSPECT-03 Offline

无法连接 DSH 时：

- 使用已安装 DSH 版本的静态 Catalog（如果可获得）。
- 明确标记“offline catalog”，不能假装是当前 Composition 的真实运行状态。

---

## 15. 错误与诊断

错误码统一：

```text
DSHX1xxx 构建
DSHX2xxx DSH / Cordis 使用
DSHX3xxx Client / Slot
DSHX4xxx Profile / Bundle
DSHX5xxx 兼容性
```

示例：

```text
DSHX3104

Slot "conversation.input.foo" is not available
in the current DSH composition.

Did you mean:
  conversation.input.plan
  conversation.input.model

Run:
  dshx inspect slots
```

```text
DSHX1201

Node module "node:fs" cannot be imported
from the DSH Client entry.

src/client.tsx:4
```

```text
DSHX5101

Detected DSH 0.1.0-rc.10.
This DSHX version is verified against:
  0.1.0-rc.8

Use --allow-unsupported to continue.
```

原则：

- 第一层错误信息描述开发者能采取的动作。
- 原始 error stack 保留在 verbose 模式。
- 不吞掉 DSH apply / Fiber failure。

---

## 16. DSH 能力覆盖策略

定义三种覆盖等级。

### A. First-class

高频、稳定、样板明显。

- Host Plugin。
- Client Plugin。
- Tool。
- React Slot。
- Client Build。
- CSS Modules。
- Client HMR。
- Profile Link。
- Build / Check。
- Inspect。

### B. Scaffold / Assisted

复杂但必须覆盖。

- Agent Event。
- Session Event。
- Tool Pipeline Event。
- Command。
- Settings。
- Conversation Node。
- Projection。
- Theme。
- Service Provider。
- Subagent。
- LLM Adapter。
- Workflow / Job。

### C. Native

直接使用官方 Context。

- `ctx.agents`。
- `ctx.sessions`。
- `ctx.fs`。
- `ctx.sandbox`。
- `ctx.approval`。
- `ctx.jobs`。
- 未来新增 DSH Service。

目标不是包装 100% API，而是让 DSHX 工程环境中 **100% 可触达** DSH 能力。

---

## 17. 常见能力覆盖矩阵

| 能力               |            v0.1 |       P1 |        P2 | 方式                            |
| ------------------ | --------------: | -------: | --------: | ------------------------------- |
| Host Plugin        |               ✓ |          |           | `defineHost`                    |
| Client Plugin      |               ✓ |          |           | `defineClient`                  |
| Tool               |               ✓ |          |           | `defineTool`                    |
| React Slot         |               ✓ |          |           | `defineSlot`                    |
| TSX / CSS Modules  |               ✓ |          |           | Vite compiler                   |
| Client HMR         |               ✓ |          |           | DSH native HMR                  |
| Profile link       |               ✓ |          |           | Official CLI                    |
| Build / Check      |               ✓ |          |           | CLI                             |
| Basic Inspect      |               ✓ |          |           | DSH catalog                     |
| Agent Event        |        scaffold |        ✓ |           | Native `ctx.on`                 |
| Tool Pipeline      |        scaffold |        ✓ |           | Native `ctx.on`                 |
| System Prompt      |          native |        ✓ |           | Shortcut + native               |
| Command            |        scaffold |        ✓ |           | Shortcut candidate              |
| Tool View          |     native Slot |        ✓ |           | `defineToolView`                |
| Settings           |          native |        ✓ |           | Host+Client helper              |
| Session Event      |        scaffold |        ✓ |           | declaration helper              |
| Conversation Node  |        scaffold |        ✓ |           | simple helper + native          |
| Projection         |          native | scaffold |         ✓ | official projection             |
| Theme              |          native | scaffold |         ✓ | official theme                  |
| Plugin-private RPC |        research | research | candidate | only after static path verified |
| Service Provider   |        scaffold |        ✓ |           | Cordis native                   |
| Subagent           |        scaffold |        ✓ |           | native provider                 |
| LLM Adapter        |        scaffold |        ✓ |           | native provider                 |
| Sandbox / Approval |          native |          |           | ctx                             |
| Jobs / Workflow    | native/scaffold |        ✓ |           | ctx                             |
| UI Playground      |                 |        ✓ |           | separate Vite dev server        |
| Dev Overlay        |                 |        ✓ |           | diagnostics                     |
| Live Catalog types |           basic |        ✓ |           | no duplicated type source       |

---

## 18. 版本兼容

DSH 当前仍处于 RC 阶段，DSHX 必须显式版本化兼容层。

示意：

```text
src/compat/
├── rc8.ts
└── ...
```

兼容层只允许保存工程协议：

- Client platform externals。
- Client bundle wrapper contract。
- Manifest shape。
- Profile / bundle metadata requirements。
- 已验证的 DSH package / subpath names。

禁止在 compat 层复制：

- Agent API。
- Session API。
- Tool API。
- Service implementation。

默认：

- 精确验证已支持版本。
- 未验证版本 warning / fail。
- 提供 `--allow-unsupported` 供高级开发者继续。

---

## 19. 测试需求

### Unit

- config resolution。
- manifest validation。
- virtual entry generation。
- external classification。
- CJS wrapper。
- CSS injection。
- diagnostics。
- compat adapter。

### Integration

- 一个 Host-only fixture。
- 一个 Client-only fixture（生成 no-op Host）。
- 一个 Full Plugin fixture。
- React + CSS Modules。
- Tool。
- Slot。
- Profile link。

### DSH Smoke

使用真实支持版本 DSH：

1. 安装 fixture plugin。
2. `dsh --profile web --dump-config` 能看到插件。
3. Web 页面能加载 Client bundle。
4. 修改 Client source。
5. build watcher 重写 bundle。
6. DSH 发出 rebuilt。
7. Browser plugin Fiber 重新挂载。
8. 不出现第二份 React。
9. CSS 旧 tag 被清理。
10. Source Map 能定位到 TSX。

### Regression

每个新增 DSH compat adapter 都必须复跑完整 Smoke Matrix。

---

## 20. 分阶段交付

### Phase A：技术可行性原型（必须先完成）

只验证：

```text
React TSX
  ↓
Vite/Rolldown
  ↓
DSH lazy-CJS factory
  ↓
DSH ClientModuleLoader
  ↓
DSH native HMR
```

验收：

- 正常 TSX。
- React external。
- 一个 Slot。
- CSS Modules。
- sourcemap。
- Client rebuild 自动触发 DSH HMR。

**Phase A 未通过前，不实现复杂 DSL。**

### v0.1：可用开发工具链

- `create-dshx`。
- `dshx dev/build/check`。
- Host build。
- Client build。
- `defineHost`。
- `defineClient`。
- `defineTool`。
- `defineSlot`。
- Client HMR。
- Profile link。
- 基础 `inspect`。
- `add tool/ui/hook`。
- 兼容 `rc.8`。

### v0.2：常用插件能力

- Tool View。
- Settings。
- System Prompt Shortcut。
- Command。
- Conversation Node scaffold。
- Event scaffold。
- Dev diagnostics overlay。
- UI Playground。

### v0.3：高级能力与生态

- Projection helpers。
- Theme helpers。
- Service / Subagent / LLM adapter scaffolds。
- 更完整 Inspect。
- Live Catalog IDE metadata。
- 测试 Harness。
- 静态插件 private RPC（仅在官方稳定 seam 验证后）。

---

## 21. 成功指标

产品可用性：

- 新用户从 create 到 DSH 中看到第一个 Tool / UI，不需要手工编辑 `cordis.patch.yml`。
- Client 插件模板中不存在 `window.__ModuleLoader__` 手写代码。
- React 插件模板不 bundle 第二份 React。
- Client 修改后不需要重启 DSH 进程。
- 高级用户能直接访问原始 `ctx`。
- v0.1 Public Runtime API 控制在小规模。

工程质量：

- 每个支持 DSH 版本有 integration smoke。
- 生成产物可通过 `dsh --profile ... --dump-config` 验证。
- Client build 错误有 DSHX 级别诊断。
- 不修改 DSH 源码即可运行。

---

## 22. Agent 开发硬约束

实现 Agent 必须遵守：

1. 先完成 Phase A，再设计或实现更多 Helper。
2. 不实现第二套 Client HMR。
3. 不在真实 DSH 页面接 Vite HMR WebSocket。
4. 不创建全局 React `DshProvider/useDsh` 暴露 Client Context。
5. 不重新实现 Agent / Session / Tool Registry。
6. 不自行管理 DSH Profile package manager。
7. 不依赖 DSH 仓库内部未发布的 `clientBundle()` 包作为运行时依赖；可以参考其行为实现兼容编译器。
8. 不把当前 DSH 源码内部类复制成 DSHX 公共 API。
9. 遇到 DSH API 不确定时，先查当前版本源码和 Catalog。
10. 所有自动修改 `package.json` 的行为必须由显式 create/add/fix 命令触发。
11. 所有高层 Helper 必须可映射回官方 DSH API。
12. 新增 Public API 前写明它消除了什么真实重复代码。
13. 不为了“全面覆盖”提前包装低频 Provider API。
14. v0.x 优先可删的薄抽象，避免长期兼容债。

---

## 23. 当前官方依据（实现前再次核对）

设计基线来自 DeepSeek Harness 官方仓库当前实现，重点路径：

- `docs/architecture.md`
- `docs/cordis-primer.md`
- `docs/cookbook/adding-a-package.md`
- `docs/cookbook/adding-a-settings-card.md`
- `docs/cookbook/adding-a-conversation-node.md`
- `packages/client/AGENTS.md`
- `packages/client/tsdown.client.ts`
- `packages/client/modules/`
- `packages/client/hmr/`
- `packages/client/runtime/`
- `packages/client/ui-renderer/`
- `packages/boot/app-boot/`
- `apps/cli/src/plugin.ts`

实现时以安装的目标 DSH 版本为真源，不以本 PRD 中的示例字段作为未来版本保证。
