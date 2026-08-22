# dshx

Build and debug DSH Host and Client plugins.

## Install

```bash
pnpm add -D @becomeopc/dshx @deepseek-ai/dsh
```

For runtime plugin loading and Inspect, also install the adapter-approved optional packages:

```bash
pnpm add -D @deepseek-ai/dsh-cordis-host-runner @deepseek-ai/dsh-tool-cordis
```

## Commands

```bash
dshx build
dshx check
dshx dev
dshx inspect slots
dshx add ui --slot <slot-name>
dshx add tool --name <tool-name>
dshx add hook --event <event-name>
```

`inspect` reads the current running Composition. It does not start DSH or fall back to an offline catalog. `check --fix` only applies deterministic manifest metadata repairs and validates the project again before completing.

See the repository README for the compatibility matrix and the full development workflow.
