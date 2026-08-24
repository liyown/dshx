# DSHX

**构建、检查并发布类型安全的 DeepSeek Harness 插件。**

[![CI](https://github.com/liyown/dshx/actions/workflows/ci.yml/badge.svg)](https://github.com/liyown/dshx/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@becomeopc/dshx?label=%40becomeopc%2Fdshx)](https://www.npmjs.com/package/@becomeopc/dshx)
[![create-dshx](https://img.shields.io/npm/v/create-dshx?label=create-dshx)](https://www.npmjs.com/package/create-dshx)
[![Node.js](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?logo=nodedotjs&logoColor=white)](./package.json)
[![License](https://img.shields.io/github/license/liyown/dshx)](./LICENSE)

[English](./README.md) · [文档](https://dshx.io/zh-CN/docs) · [Framework Hub](https://dshx.io/zh-CN) · [技术路线图](./ROADMAP.md)

DSHX 是面向 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 仓库外插件的构建期工具链。它为插件作者提供类型安全的 Host/Client 开发模型、可复现构建、运行时检查、事务式脚手架和社区 Hub，同时不替代官方 DSH Runtime。

## 60 秒开始

```bash
pnpm create dshx my-plugin
cd my-plugin
pnpm dev
```

生成的项目包含一个最小 Host Tool 和 Client Slot，会固定匹配的 DSHX 版本，并通过官方 Profile CLI 接入 DSH。非交互场景使用 `--yes`；需要由其他流程安装依赖时使用 `--no-install`。

## DSHX 提供什么

- **统一开发流程：** Host-only、Client-only、混合或原生 DSH 模块都不需要预先选择项目模式。
- **类型安全贡献：** 基于官方 DSH 合约定义 Host Tools、Commands、Client Slots 和一元 Host/Client API。
- **真实运行时检查：** 从正在运行的 Composition 读取 Slots、Tools、Services 和 Events，不伪造离线目录。
- **安全脚手架：** 通过 `--dry-run` 预览，事务式写入，并保证重复执行幂等。
- **运行时保持轻薄：** DSHX 负责构建、诊断、Profile 集成和兼容适配；DSH 负责执行、生命周期、传输和 HMR。
- **经过验证的生态：** 通过双语 [DSHX Framework Hub](https://dshx.io/zh-CN) 发现插件和文档。

## 产品组成

| 产品                                                      | 用途                                                  | 使用入口                              |
| --------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------- |
| [`@becomeopc/dshx`](./packages/dshx)                      | 编译器、类型辅助、诊断、Runtime Inspect 与 `dshx` CLI | `pnpm add -D @becomeopc/dshx`         |
| [`create-dshx`](./packages/create-dshx)                   | 创建可复现的 Host/Client 插件项目                     | `pnpm create dshx`                    |
| [`@becomeopc/dshx-hub-cli`](./packages/framework-hub-cli) | Framework Hub 的确定性本地验证和特权运维客户端        | `pnpm add -g @becomeopc/dshx-hub-cli` |
| [Framework Hub](https://dshx.io/zh-CN)                    | 插件发现、文档、社区信号和受验证的目录操作            | Web                                   |

## 常用命令

```bash
dshx build
dshx check
dshx check --fix --dry-run
dshx dev
dshx inspect slots
dshx add ui --slot <slot-name>
dshx add tool --name <tool-name>
dshx add command --name <command-name>
dshx add hook --event <event-name>
```

除非显式执行 `check --fix`，`build` 与 `check` 都是只读的。`inspect` 需要一个受支持、正在运行的 DSH Composition。脚手架命令不会安装依赖、修改 Profile 或启动 DSH。

命令行为和自动化保证见 [CLI 参考](./docs/cli-reference.md)。

## 兼容性

DSHX 按可观察的协议代际管理 DSH 支持，不会为每次发布建立 adapter，也不会把 DSH semver 机械映射成协议代际。当前 `protocol-1` adapter 覆盖 `>=0.1.0-rc.8 <0.2.0-0`；未来 DSH minor 若保持合约不变，只需扩展同一范围。

插件通过 `peerDependencies` 声明公开 DSH 支持范围，在 `devDependencies` 安装一个具体 DSH 版本，DSHX 自身版本独立演进。`build`、`dev` 与 `check` 根据实际安装的 DSH 选择 adapter；若单个产物的公开范围跨越不兼容协议代际，会在编译前拒绝。

| 状态           | 含义                                                                 |
| -------------- | -------------------------------------------------------------------- |
| `verified`     | 这个具体 DSH 版本已经通过真实运行时 smoke。                          |
| `compatible`   | 稳定版本落在已知代际内、共用同一合约，但没有单独执行 real smoke。    |
| `experimental` | 未验证的预发布版本使用已知代际 adapter，并明确警告。                 |
| `unsupported`  | 没有 adapter 覆盖该版本；除非显式使用现有 override，否则 DSHX 拒绝。 |

修改 DSH 版本范围或适配器前，请阅读[兼容与验证](./docs/compatibility.md)。

## 架构边界

```text
插件源码
    │
    ▼
DSHX 构建 + 诊断 + Profile 编排
    │
    ▼
官方 DSH 产物与运行时合约
    │
    ▼
DeepSeek Harness Runtime
```

DSHX 不实现第二套 Tool Runtime、Session Runtime、依赖容器、事件总线、Connection 传输或 HMR 系统。详细边界和仓库结构见[架构说明](./docs/architecture.md)。

## 开发本仓库

要求 Node.js `^22.19.0 || >=24.0.0`，以及根 `package.json` 声明的 pnpm 版本。

```bash
pnpm install --frozen-lockfile
pnpm check:all
```

通用真实 DSH smoke 始终是 CI 门禁，单元测试或模拟 loader 不能替代它。npm 包发布与 Framework Hub 生产部署都只允许在本地执行，不由 GitHub Actions 触发。

提交改动前请阅读[贡献指南](./CONTRIBUTING.md)、[依赖政策](./docs/dependency-policy.md)和[安全政策](./SECURITY.md)。产品方向和未完成能力门禁继续以[技术路线图](./ROADMAP.md)为准。

## 许可证

[MIT](./LICENSE) © DSHX contributors.
