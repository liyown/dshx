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

- Tool, Command, Session, Prompt, Event, Service, Slot, and provider lifecycles;
- dependency injection, registration collisions, cancellation, disposal, and ordering;
- Connection transport, browser runtime, Client HMR, and Host process semantics.

Public DSHX helpers are thin declarations over official contracts. Native named DSH modules and direct `setup(ctx)` access remain supported escape hatches.

## Build and runtime flow

1. DSHX resolves the nearest plugin project and selects a compatible adapter.
2. The compiler validates the manifest and builds whichever Host or Client entries are enabled.
3. Generated helpers are inlined; official runtime packages remain external and are resolved by DSH.
4. `dshx dev` links the project through the official Profile CLI, starts watchers, and launches DSH only after enabled entries have built successfully.
5. Client rebuilds use native DSH HMR. Host rebuild behavior follows the configured restart policy.

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
