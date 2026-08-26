# Tooling API

**Status: Tooling / Experimental**

**Entry: `@becomeopc/dshx/tooling`**

**Environment: Node.js only**

Do not import this entry from Host, Client, API contract, or Settings contract source. Tooling types may change during `0.1.x` as DSH protocols and Vite evolve.

## Programmatic builds

```ts
import {
  buildClient,
  buildHost,
  watchClient,
  watchHost,
} from "@becomeopc/dshx/tooling";
```

```ts
interface BuildHostOptions {
  readonly packageId: string;
  readonly logicalName?: string;
  readonly root?: string;
  readonly entry?: string;
  readonly outDir: string;
  readonly sourcemap?: boolean;
  readonly declarations?: boolean;
  readonly vite?: { readonly plugins?: readonly PluginOption[] };
  readonly compatibility?: DshCompatibility;
}

interface BuildClientOptions {
  readonly packageId: string;
  readonly logicalName?: string;
  readonly root?: string;
  readonly entry: string;
  readonly outDir: string;
  readonly sourcemap?: boolean;
  readonly declarations?: boolean;
  readonly vite?: { readonly plugins?: readonly PluginOption[] };
  readonly external?: readonly string[];
  readonly inject?: readonly string[];
  readonly compatibility?: DshCompatibility;
}
```

`buildHost()` and `buildClient()` return a DSHX report, never a raw Vite `RollupOutput`:

```ts
interface BuildReport {
  readonly face: "host" | "client";
  readonly entryFile: string;
  readonly outDir: string;
  readonly output: readonly {
    readonly fileName: string;
    readonly type: "chunk" | "asset" | "declaration";
  }[];
}
```

There is no `watch?: boolean` option. Call `watchHost()` or `watchClient()` explicitly:

```ts
interface BuildWatcher {
  on(event: "event", listener: (event: BuildEvent) => void): BuildWatcher;
  close(): Promise<void>;
}
```

`BuildEvent` normalizes `START`, `BUNDLE_START`, `BUNDLE_END`, `END`, and `ERROR` without exposing the Vite watcher object.

## Config resolution

```ts
const project = await resolveDshxConfig({ cwd });
```

`ResolvedDshxConfig` contains canonical project paths, enabled entries, separately instantiated Host/Client Vite plugins, output directory, Profile name, build flags, compatibility override, manifest, and config dependency files. Resolution is read-only.

Use `defineConfig` from the root or `/config` authoring entry; `resolveDshxConfig` is intentionally Tooling-only.

## Compatibility and diagnostics

The Tooling entry exports the protocol registry and its pure analysis functions, including:

```ts
resolveCompatibility(version)
classifyCompatibility(version)
analyzeDeclaredDshRange(range)
assessProjectCompatibility(manifest, installedVersion)
getCompatibilityCapabilities(compatibility)
getCompatibilitySmokeMatrix()
projectCompatibilityDiagnostics(...)
```

It also exports `DshxError`, structured diagnostic types, `PROTOCOL_1_COMPATIBILITY`, `DEFAULT_COMPATIBILITY`, and the complete adapter registry. Consumers should branch on diagnostic codes/status fields, not parse message text.

## CLI and repair APIs

`parseCliArgs`, `runCli`, and their IO/runtime types support embedding the published CLI grammar in Node tools. Manifest repair is a separate transactional sequence:

```ts
const plan = await createManifestRepairPlan(project, options);
await applyManifestRepairPlan(plan);
// rollbackManifestRepairPlan(plan) if later validation fails
```

Repair APIs only handle deterministic manifest changes. They do not install dependencies, rewrite source migrations, change Profiles, or start DSH.

## Removed entries

`@becomeopc/dshx/compiler`, `/compat`, and `/cli` were removed in `0.1.2`. Import their supported replacements from `/tooling`; no runtime compatibility subpaths are provided.
