# CLI reference

## `dshx`

| Command                 | Purpose                                                                                                                        | Writes project files        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `dshx build`            | Validate and compile enabled Host/Client entries                                                                               | Build output only           |
| `dshx check`            | Inspect manifests, DSH compatibility, Profile link, and Inspect readiness                                                      | No                          |
| `dshx check --fix`      | Apply deterministic manifest metadata repairs and revalidate                                                                   | Only explicit repair fields |
| `dshx dev`              | Link the project, watch enabled entries, and run DSH                                                                           | Profile link when required  |
| `dshx inspect <target>` | Read an adapter-supported live target; protocol-1 exposes `slots`, `services`, and `events`, while `tools` reports unavailable | No                          |
| `dshx add <target>`     | Generate `ui`, `tool`, `command`, or `hook` source                                                                             | Yes, transactionally        |

Use `--json` with `check`, `inspect`, and `add` for automation. `--dry-run` previews scaffold changes and `check --fix` repairs. `--verbose` adds provider causes without changing stable diagnostic codes.

Interactive `dshx dev` maps `r` to one explicit Host restart and `q`/Ctrl-C to a bounded close. Non-interactive sessions respond only to process signals.

## `create-dshx`

```bash
pnpm create dshx <name> [--cwd <path>] [--install|--no-install] [--yes] [--package-manager pnpm|yarn|npm]
```

The initializer refuses to overwrite a non-empty target. Package-manager selection uses an explicit flag first, then an existing lockfile, the nearest `packageManager` declaration, and finally available commands on `PATH`.

## `dshx-hub`

The Hub CLI is JSON-first. It validates local evidence without running third-party package scripts and performs privileged operations only after browser PKCE login. Run `dshx-hub help` or `dshx-hub <group> --help` for the current command contract.

Credentials are stored only in the operating-system keyring. Commands that accept `--input` read JSON from a file or `-` for stdin; `--output` writes deterministic JSON to a file instead of stdout.
