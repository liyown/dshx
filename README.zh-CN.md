# DSHX

**构建、检查并发布类型安全的 DeepSeek Harness 插件。**

[![CI](https://github.com/liyown/dshx/actions/workflows/ci.yml/badge.svg)](https://github.com/liyown/dshx/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@becomeopc/dshx?label=%40becomeopc%2Fdshx)](https://www.npmjs.com/package/@becomeopc/dshx)
[![create-dshx](https://img.shields.io/npm/v/create-dshx?label=create-dshx)](https://www.npmjs.com/package/create-dshx)
[![Node.js](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?logo=nodedotjs&logoColor=white)](./package.json)
[![License](https://img.shields.io/github/license/liyown/dshx)](./LICENSE)

[English](./README.md) · [文档](./docs/index.md) · [Framework Hub](https://dshx.io/zh) · [路线图](./ROADMAP.md)

DSHX 是面向 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 仓库外插件的构建期工具链，提供类型安全的 Host/Client authoring、受约束的 Vite 构建、离线诊断、Profile 开发流程和可复现模板。执行、registry、scope、transport、持久化、Prompt assembly、HMR 与 disposer 生命周期仍由官方 DSH/Cordis 管理。

首个可用版本通过 npm 的 `preview` tag 分发；完成 Preview 验证前，不覆盖现有 `latest` 开发版本。

## 创建项目

```bash
pnpm create dshx@preview my-plugin
cd my-plugin
pnpm check
pnpm dev
```

默认生成最小 `starter + css-modules`：一个 Host Tool 和一个可见 Client Slot。需要完整 Candidate API 示例和可选 Tailwind 时执行：

```bash
pnpm create dshx@preview my-plugin --template showcase --style tailwind
```

模板为 `starter | showcase`，样式为 `css-modules | tailwind | none`。Tailwind 使用标准 v4 Vite 插件、`dshx:` 前缀，并省略 Preflight。

## 正式参考插件

[`@becomeopc/dshx-plugin-marketplace`](./packages/plugin-marketplace/README.md) 是仓库内的正式自举参考插件。它以普通 DSH bundle 接入「设置 → 插件 → 插件市场」，并完整串联 `defineHost`、`defineSettings`、`defineApi`、`defineClient`、`defineLocale`、`defineSlot`、Standard Schema 校验、`useApiQuery`、CSS Modules、Profile 安装和 Client HMR。

使用真实 DSH 开发 Profile 运行：

```bash
pnpm --filter @becomeopc/dshx-plugin-marketplace dev
```

## Authoring 示例

```ts
// src/api/status.ts
import { defineApi, method } from "@becomeopc/dshx/api";

export const statusApi = defineApi({
  id: "status",
  version: 1,
  methods: {
    get: method<void, { readonly ready: boolean }>(),
  },
});
```

```ts
// src/host.ts
import { defineHost } from "@becomeopc/dshx/host";
import { statusApi } from "./api/status.js";

export default defineHost({
  apis: [
    statusApi.host({
      get: () => ({ ready: true }),
    }),
  ],
});
```

```tsx
// src/client.tsx
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import {
  defineClient,
  defineLocale,
  defineSlot,
  useApiQuery,
  type PropsLocaleOf,
} from "@becomeopc/dshx/client";
import { statusApi } from "./api/status.js";

const copy = defineLocale("my-plugin.status", {
  zh: { ready: "就绪", unavailable: "不可用" },
  en: { ready: "Ready", unavailable: "Unavailable" },
});

function Status({ t }: PropsLocaleOf<typeof copy>) {
  const query = useApiQuery(statusApi, "get", { enabled: true });
  if (query.status === "pending") return <p>{query.fetchStatus}</p>;
  if (query.status === "error")
    return <button onClick={query.refetch}>Retry</button>;
  return <p>{t(query.data.ready ? "ready" : "unavailable")}</p>;
}

const statusSlot = defineSlot("sidebar.footer.action", {
  id: "my-plugin.status",
  order: 0,
  locale: copy,
  component: Status,
});

export default defineClient({ locales: [copy], slots: [statusSlot] });
```

`defineLocale` 推导唯一词条集合、在 Slot 前注册词典，并为组件提供类型安全的 `t()`。package 仍须在 `dsh.client.inject` 声明 `@deepseek-ai/dsh-client-locale`；`create-dshx` 会生成该 provider edge。最终 tree-shaking 后仍保留的 `useApiQuery` 会自动声明 `connection` 能力。

## 公共入口

| 入口                           | 状态                   | 用途                                            |
| ------------------------------ | ---------------------- | ----------------------------------------------- |
| `@becomeopc/dshx` 与 `/config` | API Candidate          | 仅 browser-safe `defineConfig` 和 `DshxConfig`  |
| `/host`                        | API Candidate          | Host 定义、Tools、Commands、Prompt contribution |
| `/client`                      | API Candidate          | Client 定义、Locale、Slots、API/Settings Hooks  |
| `/api`                         | API Candidate          | 共享类型 API contract 与 opaque error           |
| `/settings`                    | API Candidate          | 共享 Schemastery Settings contract              |
| `/experimental/conversation`   | Experimental           | 纯官方事件生命周期和 React renderer             |
| `/tooling`                     | Tooling / Experimental | Node-only compiler、兼容、诊断、CLI、repair API |

API Candidate 表示当前 `0.1.x` 计划保持的 authoring 形状，不是 1.0 稳定承诺。被删除的字段、入口和别名见[从 0.1.1 迁移到 0.1.2](./docs/migrations/0.1.1-to-0.1.2.zh-CN.md)。

## 技术文档

| 章节                                              | API 与行为                                                      |
| ------------------------------------------------- | --------------------------------------------------------------- |
| [Host](./docs/guides/host.md)                     | `defineHost`、注册顺序、inject、生命周期                        |
| [Client、Locale 与 Slot](./docs/guides/client.md) | `defineClient`、`defineLocale`、`defineSlot`、官方 props 与接线 |
| [Typed API](./docs/guides/api.md)                 | Standard Schema、handler、命令式调用、`useApiQuery`、错误       |
| [Settings](./docs/guides/settings.md)             | contract、Host facet、decoder、secret、Hook 状态与 mutation     |
| [Prompt](./docs/guides/prompt.md)                 | Section、Context、顺序与 assembly ownership                     |
| [Conversation](./docs/guides/conversation.md)     | 实验性 `initial/reduce/project/render` 生命周期                 |
| [Build](./docs/guides/build.md)                   | Vite 插件约束、CSS/资源、Tailwind、declaration、watch           |
| [Creator](./docs/guides/creator.md)               | 模板/样式矩阵和 programmatic generation                         |
| [Tooling](./docs/guides/tooling.md)               | programmatic build/watch、兼容、诊断、repair                    |

另见 [CLI 参考](./docs/cli-reference.md)、[兼容与验证](./docs/compatibility.md)和[架构](./docs/architecture.md)。

Preview 范围与已知限制见 [Preview](./docs/preview.md)，插件包发布要求见 [Publishing](./docs/guides/publishing.md)。

## CLI

```bash
dshx check                 # 离线检查 config、manifest、迁移、兼容、TypeScript
dshx check --runtime       # 额外要求 Profile、Composition、bridge、runtime readiness
dshx build                 # 先 typecheck，再构建 Host/Client
dshx dev                   # Vite build-watch 加官方 DSH 开发会话
dshx inspect slots
dshx add ui --slot <slot-name>
```

除非显式使用 `--fix`，`check` 保持只读。`build` 不改写源码或 Manifest 元数据。`inspect` 需要受支持且正在运行的 Composition。完整命令与 JSON 字段见 [CLI 参考](./docs/cli-reference.md)。

## 兼容性

当前 `protocol-1` adapter 发布 npm 安全的 peer range `>=0.1.0-rc.8 <0.2.0-0 || 0.1.1-rc.2`；真实运行时验证边界为 `0.1.0-rc.8` 和 `0.1.1-rc.2`。显式 rc.2 分支用于避开 npm 对跨 patch prerelease 的排除规则。插件公开支持范围写入 `peerDependencies`，本地开发使用一个具体 `devDependencies` 版本。

Conversation 仍为 Experimental，因为已发布协议没有仓库外 durable event vocabulary registry；它只能使用官方 `SessionEventMap` 键。

## 开发本仓库

```bash
pnpm install --frozen-lockfile
pnpm check:all
pnpm smoke:packages
pnpm smoke:dsh -- --version 0.1.0-rc.8
pnpm smoke:dsh -- --version 0.1.1-rc.2
```

提交前请阅读[贡献指南](./CONTRIBUTING.md)、[依赖政策](./docs/dependency-policy.md)和[安全政策](./SECURITY.md)。

## 许可证

[MIT](./LICENSE) © DSHX contributors.
