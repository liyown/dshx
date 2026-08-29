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
dshx dev [--cwd <project>] [--port <0-65535>] [--open] [--verbose]
```

Dev uses Vite build-watch with `command: 'build'` in development mode, links the package through the official DSH Profile CLI when needed, and launches DSH only after required initial builds succeed. It is not a Vite dev server.

Successful Host rebuilds restart the Host automatically by default. Set `dev.hostRestart: 'manual'` to require an explicit restart instead. Interactive input maps `r` to one explicit Host restart under either policy and `q`/Ctrl-C to bounded shutdown. Client rebuilds use official DSH HMR. Config/dependency reloads keep the last-good session until replacement watchers resolve and build successfully.

`--port 0` asks DSH to allocate an available Web port. Use a concrete port when browser state or an external test must keep the same address across automatic Host restarts. If omitted, DSHX follows the configured/default DSH Web port.

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
| `--port <0-65535>`    | dev                 | Select the DSH Web port; `0` allocates one    |
| `--help`, `--version` | all                 | Print CLI metadata                            |

## `create-dshx`

```bash
pnpm create dshx@preview <name> \
  [--template starter|showcase] \
  [--style css-modules|tailwind|none] \
  [--cwd <path>] \
  [--install|--no-install] \
  [--yes] \
  [--package-manager pnpm|yarn|npm]
```

`--yes` defaults to `starter + css-modules`. Interactive mode asks for template and style independently, follows the invoking package manager, and shows animated progress while dependencies install. The initializer refuses an existing target directory and writes the selected provider edges plus runtime packages required by the compiled Host. See [Creator](./guides/creator.md).

## `dshx-hub`

The Hub CLI is a stateless, JSON-first client for Agent-operated catalog maintenance. The Agent chooses what to inspect and how to combine operations; the Hub owns validation, field precedence, revisions, concurrency, visibility, and audit records. Credentials stay in the operating-system keyring, and `--all` pagination state exists only for the lifetime of the current process.

| Command                    | Purpose                                                               | Hub write |
| -------------------------- | --------------------------------------------------------------------- | --------- |
| `auth login/status/logout` | Manage the local Hub credential                                       | Auth only |
| `status`                   | Read reachability, authentication, plugin counts, and submission load | No        |
| `source discover`          | Search public GitHub/npm metadata with time windows and cursors       | No        |
| `source inspect`           | Normalize public GitHub/npm facts into `PluginObservationV1`          | No        |
| `plugin list/get`          | Query summary or complete operational plugin views                    | No        |
| `plugin upsert`            | Merge one or more source observations                                 | Yes       |
| `plugin curate`            | Change only curated names, copy, categories, tags, and derivation     | Yes       |
| `plugin hide/restore`      | Change public visibility with an audited reason                       | Yes       |
| `submission list/get`      | Read user submissions                                                 | No        |
| `submission resolve`       | Mark a submission accepted, duplicate, or ignored                     | Yes       |
| `report latest`            | Read the previous immutable daily operations report                   | No        |
| `report publish`           | Publish one bilingual completed or partial run report                 | Yes       |
| `media upload`             | Store validated plugin media and metadata                             | Yes       |
| `audit`                    | Read catalog, storage, or community consistency findings              | No        |

`source inspect` accepts `github:owner/repository`, `npm:package-name`, GitHub repository URLs, and npm package URLs. It may discover several workspace packages, but its scan is bounded and reports truncation. Each observation preserves the exact public README collection result, its content hash and source location, plus public GitHub publisher identity and avatar facts when available. It never installs a package, executes package scripts, launches DSH, or tests third-party behavior.

The inspect result can be saved or piped into an upsert:

```bash
dshx-hub source inspect https://github.com/foo/bar --output /tmp/plugin.json
dshx-hub plugin upsert --input /tmp/plugin.json

dshx-hub source inspect npm:foo \
  | dshx-hub plugin upsert --input -
```

All output uses one envelope. Success contains `ok: true`, `data`, `warnings`, and `meta.requestId`; failure contains `ok: false`, one error with stable `code`, `retryable`, optional `repairHint`, details, and the request ID. Exit code `0` includes warnings and unchanged writes, `1` is a command-level failure, and `2` means a batch had partial failure.

For a guarded content edit, read the current revision and send it back with the mutation:

```bash
dshx-hub plugin get PLUGIN_ID
dshx-hub plugin curate PLUGIN_ID --if-revision 5 --input content.json
```

On `revision_conflict`, fetch the current plugin, merge the intended content, and retry with the new revision. For batch results, keep successful items and inspect each rejected item's error independently.

`status`, filtered `plugin list`, and scoped `audit` are planning inputs; they do not prescribe another command. Examples are compositions, not a required state machine. Use `dshx-hub <command> --help` for the exact flags and read/write contract, and see [Framework Hub Operations](../apps/framework-hub/OPERATIONS.md) for the server API and merge rules.
