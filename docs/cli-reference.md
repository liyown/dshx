# CLI reference

## `dshx check`

Plain `check` is offline. It validates:

- `dshx.config.ts` and enabled face entries;
- package exports, types/bin paths, DSH manifest fields, provider edges, and protocol range;
- `0.1.1` migration patterns in TypeScript source;
- TypeScript with `noEmit`;
- installed/development DSH compatibility when package metadata is locally available.

It does not require a Profile, Composition, bridge, browser, or running DSH process.

```bash
dshx check
dshx check --json
dshx check --fix --dry-run
dshx check --fix
```

`--fix` applies only deterministic manifest repairs, re-resolves the project, and rolls back when post-write validation fails. It does not rewrite migration diagnostics, source, dependencies, or Profile state.

Use runtime mode explicitly:

```bash
dshx check --runtime
dshx check --runtime --json
```

Runtime mode additionally requires a supported DSH installation, the configured Profile link, Composition/runtime readiness, optional runtime plugin state, and Inspect bridge state. JSON output always separates `static`, `typecheck`, and `runtime` status; offline output reports runtime as `skipped`.

## `dshx build`

```bash
dshx build [--cwd <project>] [--verbose]
```

Build runs the offline manifest, migration, compatibility, and TypeScript checks before compiling. It builds enabled Host and Client faces through the bounded Vite kernel, emits declarations by default, and verifies the artifact shape. Its only writes are build outputs.

## `dshx dev`

```bash
dshx dev [--cwd <project>] [--open] [--verbose]
```

Dev uses Vite build-watch with `command: 'build'` in development mode, links the package through the official DSH Profile CLI when needed, and launches DSH only after required initial builds succeed. It is not a Vite dev server.

Interactive input maps `r` to one explicit Host restart and `q`/Ctrl-C to bounded shutdown. `dev.hostRestart: 'auto'` restarts the Host after successful Host rebuilds. Client rebuilds use official DSH HMR. Config/dependency reloads keep the last-good session until replacement watchers resolve and build successfully.

## `dshx inspect`

```bash
dshx inspect slots [--root <slot>] [--json]
dshx inspect tools [--json]
dshx inspect services [--json]
dshx inspect events [--json]
```

Inspect is read-only and runtime-only. It queries only adapter-supported official providers in the active Composition. An unsupported or unavailable provider returns a diagnostic rather than an offline/fabricated catalog.

## `dshx add`

```bash
dshx add ui --slot <slot> [--provider <package>] [--id <id>] [--order <n>]
dshx add tool --name <name> [--description <text>]
dshx add command --name <name> [--description <text>]
dshx add hook --event <event>
```

All add commands accept `--file`, `--dry-run`, and `--json`. They generate source transactionally and roll back on validation failure. They do not install packages, change Profiles, or start DSH. There are no `add api`, `add settings`, `add prompt`, or `add conversation` commands.

## Shared options

| Option                | Commands            | Effect                                        |
| --------------------- | ------------------- | --------------------------------------------- |
| `--cwd <path>`        | all                 | Resolve another plugin project                |
| `--verbose`           | all                 | Include underlying provider/process causes    |
| `--json`              | check, inspect, add | Stable machine-readable output                |
| `--runtime`           | check               | Enable Profile/Composition/runtime validation |
| `--fix`               | check               | Apply deterministic manifest repairs          |
| `--dry-run`           | check --fix, add    | Produce a plan/diff without writing           |
| `--open`              | dev                 | Open the development URL                      |
| `--help`, `--version` | all                 | Print CLI metadata                            |

## `create-dshx`

```bash
pnpm create dshx <name> \
  [--template starter|showcase] \
  [--style css-modules|tailwind|none] \
  [--cwd <path>] \
  [--install|--no-install] \
  [--yes] \
  [--package-manager pnpm|yarn|npm]
```

`--yes` defaults to `starter + css-modules`. Interactive mode asks for template and style independently. The initializer refuses an existing target directory and writes only dependencies/provider edges used by the selected combination. See [Creator](./guides/creator.md).

## `dshx-hub`

The Hub CLI is JSON-first. It validates local evidence without running third-party package scripts and performs privileged operations only after browser PKCE login. Credentials stay in the operating-system keyring. Run `dshx-hub help` or `dshx-hub <group> --help` for its current command grammar.
