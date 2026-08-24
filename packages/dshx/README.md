# @becomeopc/dshx

Build, inspect, and ship typed DeepSeek Harness Host and Client plugins without adding a second application runtime.

## Install

```bash
pnpm add -D @becomeopc/dshx @deepseek-ai/dsh
```

Install the adapter-approved Host plugins when your project uses Runtime Inspect or those official contribution seams:

```bash
pnpm add -D @deepseek-ai/dsh-cordis-host-runner @deepseek-ai/dsh-tool-cordis
```

## Commands

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

`build` and `check` are read-only unless `check --fix` is explicitly requested. `inspect` reads the current running Composition and never falls back to a fabricated catalog. Scaffold commands are transactional, support `--dry-run`, and do not install dependencies or mutate Profiles.

## Public modules

- `@becomeopc/dshx/host`: `defineHost`, the official `defineTool`, and `defineCommand`.
- `@becomeopc/dshx/client`: `defineClient` and typed Slot contributions.
- `@becomeopc/dshx/api`: typed unary Host/Client APIs.
- `@becomeopc/dshx/config`: project configuration.
- `@becomeopc/dshx/compiler`: programmatic Host and Client builds.
- `@becomeopc/dshx/cli`: stable parser and CLI runner interfaces.

DSHX `0.1.x` targets the DSH `0.1` protocol generation. See the [documentation](https://dshx.io/docs), [compatibility policy](https://github.com/liyown/dshx/blob/main/docs/compatibility.md), and [roadmap](https://github.com/liyown/dshx/blob/main/ROADMAP.md).

MIT © DSHX contributors.
