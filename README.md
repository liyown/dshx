# DSHX

DSHX is a build-time development toolkit for out-of-tree DeepSeek Harness plugins.

Development currently targets DSH `0.1.0-rc.8`. The implemented foundation includes the Host and Client compilers, read-only project configuration resolution, strict package/patch manifest checking, idempotent Profile linking through the official DSH CLI, and the internal development process orchestrator.

```bash
pnpm install
pnpm check
```

Projects can import `defineConfig` and `resolveDshxConfig` from `dshx/config`. Resolution finds the nearest `package.json`, loads only a root `dshx.config.ts`, and applies explicit fields before the `src/host.ts` / `src/client.tsx` conventions and defaults. The package ID always remains `package.json.name`; an optional config `name` is a separate logical Host name.

Manifest checking reports all errors and publishing warnings without rewriting `package.json`, `dshx.config.ts`, or `cordis.patch.yml`. Enabled source faces require their rc.8 exports and DSH metadata. Host-only projects omit Client metadata; Client-only projects retain the root Host export for the generated no-op Host artifact.

Profile orchestration requires a project-local `@deepseek-ai/dsh` installation and resolves it with `pnpm exec dsh`; global fallback is intentionally disabled. It inspects and changes Profile state only through `dsh plugin`, skips an existing link to the same real project path, and rejects package-name or path conflicts before installation. Unsupported DSH versions fail by default; `compatibility.allowUnsupported` continues with the rc.8 adapter and a persistent warning.

The internal development session keeps Host and Client watchers alive when their first build fails. DSH starts only after every enabled source face has built successfully at least once, using the project root, resolved Profile, and `pnpm exec dsh`; Web sessions add `--no-open` by default. Client rebuilds rely on rc.8 native HMR. Host rebuilds either mark `hostRestartRequired` for the default manual policy or serialize an automatic DSH restart when `dev.hostRestart` is `auto`.

An unexpected DSH exit is reported as failed and is not put into an automatic restart loop. `restart()` performs one explicit stop/start without changing the Profile link. `close()` is idempotent, closes both watchers first, then sends SIGTERM to DSH and escalates to SIGKILL after a bounded timeout. Terminal input, raw mode, `r`/`q` mappings, and user command parsing remain deferred to the CLI stage.

Host projects can import `defineHost` from `dshx/host` and default-export a definition with `inject`, official DSH `ToolDefinition` values, and direct `setup(ctx)` access to the official Cordis Context. `defineHost()` preserves the original object; the Host compiler supplies the resolved logical name, merges the `tools` dependency when needed, registers tools through `ctx.tools.register()`, and runs setup afterward. The helper and its thin adapter are inlined into `dist/index.js`, so built Hosts do not import a DSHX runtime.

Existing native Host modules with named `name`, `inject`, `Config`, and `apply` exports remain supported. This stage does not re-export the official `defineTool`, infer service dependencies from `setup(ctx)`, or add Host config-schema shortcuts.

The real DSH browser/HMR smoke test remains a release gate. Unit or simulated loader tests do not count as that verification.
