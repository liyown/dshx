# DSHX

**Build, inspect, and ship typed DeepSeek Harness plugins.**

[![CI](https://github.com/liyown/dshx/actions/workflows/ci.yml/badge.svg)](https://github.com/liyown/dshx/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@becomeopc/dshx?label=%40becomeopc%2Fdshx)](https://www.npmjs.com/package/@becomeopc/dshx)
[![create-dshx](https://img.shields.io/npm/v/create-dshx?label=create-dshx)](https://www.npmjs.com/package/create-dshx)
[![Node.js](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-339933?logo=nodedotjs&logoColor=white)](./package.json)
[![License](https://img.shields.io/github/license/liyown/dshx)](./LICENSE)

[简体中文](./README.zh-CN.md) · [Documentation](https://dshx.io/docs) · [Framework Hub](https://dshx.io) · [Roadmap](./ROADMAP.md)

DSHX is the build-time toolchain for out-of-tree [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) plugins. It gives plugin authors a typed Host and Client authoring model, repeatable builds, live runtime inspection, transactional scaffolding, and a community Hub—without replacing the official DSH runtime.

## Start in 60 seconds

```bash
pnpm create dshx my-plugin
cd my-plugin
pnpm dev
```

The generated project contains a minimal Host Tool and Client Slot, pins the matching DSHX release, and links to DSH through the official Profile CLI. Use `--yes` for non-interactive creation and `--no-install` when dependency installation belongs to another step.

## What DSHX provides

- **One authoring workflow:** build Host-only, Client-only, mixed, or native DSH modules without selecting a project mode.
- **Typed contributions:** define Host Tools, Commands, Client Slots, and unary Host/Client APIs against official DSH contracts.
- **Live inspection:** inspect Slots, Tools, Services, and Events from the running Composition—never from a fabricated offline catalog.
- **Safe scaffolding:** preview source changes with `--dry-run`, apply them transactionally, and rerun idempotently.
- **Runtime-thin development:** DSHX owns build, diagnostics, Profile integration, and compatibility adapters; DSH owns execution, lifecycle, transport, and HMR.
- **Verified ecosystem:** discover plugins and documentation through the bilingual [DSHX Framework Hub](https://dshx.io).

## Products

| Product                                                   | Purpose                                                                             | Entry point                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------- |
| [`@becomeopc/dshx`](./packages/dshx)                      | Compiler, typed helpers, diagnostics, runtime Inspect, and the `dshx` CLI           | `pnpm add -D @becomeopc/dshx`         |
| [`create-dshx`](./packages/create-dshx)                   | Project initializer for reproducible Host and Client plugin projects                | `pnpm create dshx`                    |
| [`@becomeopc/dshx-hub-cli`](./packages/framework-hub-cli) | Deterministic local verification and privileged operations client for Framework Hub | `pnpm add -g @becomeopc/dshx-hub-cli` |
| [Framework Hub](https://dshx.io)                          | Plugin discovery, documentation, community signals, and verified catalog operations | Web                                   |

## Everyday commands

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

`build` and `check` are read-only unless `check --fix` is explicitly requested. `inspect` requires a supported running DSH Composition. Scaffold commands do not install packages, mutate Profiles, or start DSH.

See the [CLI reference](./docs/cli-reference.md) for command behavior and automation guarantees.

## Compatibility

DSHX `0.1.x` targets the DSH `0.1` protocol generation.

| DSH version              | Status               | Verification                                                                         |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------ |
| `0.1.0-rc.8`             | Verified             | Phase A fixture, browser Client, Inspect, and HMR                                    |
| `0.1.1-rc.2`             | Verified             | Cold-start matrix, Profile linking, APIs, Commands, Inspect, restart, and Client HMR |
| Later compatible `0.1.x` | Allowed with warning | Must pass the real smoke matrix before being marked verified                         |
| Outside `0.1.x`          | Rejected by default  | Requires an explicit compatibility override                                          |

Read [compatibility and verification](./docs/compatibility.md) before changing DSH ranges or adapters.

## Architecture boundary

```text
plugin source
    │
    ▼
DSHX build + diagnostics + Profile orchestration
    │
    ▼
official DSH artifacts and runtime contracts
    │
    ▼
DeepSeek Harness runtime
```

DSHX deliberately does not implement a second Tool runtime, Session runtime, dependency container, event bus, connection transport, or HMR system. The detailed boundary and repository layout are documented in [Architecture](./docs/architecture.md).

## Develop this repository

Requirements: Node.js `^22.19.0 || >=24.0.0` and the pnpm version declared in `package.json`.

```bash
pnpm install --frozen-lockfile
pnpm check:all
```

The real DSH browser/HMR smoke remains a release gate; unit or simulated-loader tests do not replace it. Framework Hub production deployment is intentionally local-only and is not run by GitHub Actions.

Read [Contributing](./CONTRIBUTING.md), the [dependency policy](./docs/dependency-policy.md), and the [Security policy](./SECURITY.md) before opening a change. Product direction and unfinished capability gates remain visible in the [Roadmap](./ROADMAP.md).

## License

[MIT](./LICENSE) © DSHX contributors.
