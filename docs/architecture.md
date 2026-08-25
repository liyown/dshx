# Architecture

DSHX is a build-time and development-time toolchain. It produces artifacts that the official DeepSeek Harness runtime can load, but it does not become part of the plugin's application runtime.

## Ownership boundary

DSHX owns:

- project discovery, configuration, manifest diagnostics, and deterministic repair;
- Host and Client compilation into DSH-compatible artifacts;
- compatibility selection for verified DSH protocol generations;
- Profile linking through the official `dsh plugin` CLI;
- coordinated development processes, live Inspect access, and source scaffolding.

DSH and Cordis own:

- Tool, Command, Session, Prompt, Settings, Event, Service, Slot, and provider lifecycles;
- dependency injection, registration collisions, cancellation, disposal, and ordering;
- Connection transport, browser runtime, Client HMR, and Host process semantics.

Public DSHX helpers are thin declarations over official contracts. Declarative Tools, Commands, Prompt Sections and Contexts, Settings ownership, Slots, and DSHX APIs may be adapted by the selected generation adapter. Settings contracts are shared, but Host-only facets stay in the Host graph; a retained Client Hook drives the official `settingsScope` dependency after tree-shaking. Native named DSH modules and direct `setup(ctx)` calls use official DSH/Cordis APIs directly; compatibility of those calls remains the plugin author's responsibility.

## Build and runtime flow

1. DSHX resolves the nearest plugin project, reads its public DSH peer range, and detects the DSH version actually installed for development.
2. The installed DSH version selects one protocol-generation adapter; the public range must fit wholly inside that generation for the default single artifact.
3. The compiler validates the manifest and builds whichever Host or Client entries are enabled.
4. Generated helpers are inlined; official runtime packages remain external and are resolved by DSH.
5. `dshx dev` links the project through the official Profile CLI, starts watchers, and launches DSH only after enabled entries have built successfully.
6. Client rebuilds use native DSH HMR. Host rebuild behavior follows the configured restart policy.

## Compatibility registry

One adapter represents one observable DSH contract generation, not one published version or semver minor. Its non-overlapping semver range, lifecycle, protocol capabilities, and real-smoke verification boundaries live together under `packages/dshx/src/compat`. One DSHX release may contain multiple adapters, while one built plugin artifact targets one adapter by default. Stable in-range versions may be compatible without being verified; unverified prereleases are experimental. CI derives representative minimum/latest jobs from the same registry and runs one version-parameterized scenario.

## Inspect boundary

Inspect is read-only and requires a running, supported Composition. The Host-owned bridge uses a per-user local socket and short-lived token, exposes only allowlisted official catalogs/providers, and never carries application business traffic. Missing runtime capability returns stable diagnostics instead of an offline guess.

## Repository layout

- `packages/dshx`: compiler, compatibility adapters, public helpers, CLI, Inspect, and scaffolds.
- `packages/create-dshx`: project initializer.
- `packages/framework-hub-cli`: local verification and privileged Hub operations client.
- `apps/framework-hub`: bilingual website and Cloudflare-backed catalog/community application.
- `fixtures`: real compatibility fixtures, not product project modes.
- `scripts`: release and real-runtime smoke orchestration.

See the [Roadmap](../ROADMAP.md) for capability gates and explicit non-goals.
