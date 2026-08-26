# @becomeopc/dshx

## 0.1.2

### Patch Changes

- 856b593: Add typed Prompt Section and dynamic Prompt Context contributions backed by the official DSH System Prompt registry, and include them in newly generated plugin projects.
- 586ff4e: Add the Hub community and approval operations contract, approval-aware CLI workflows, and a real DSH loader/HMR release gate while preserving the runtime-thin framework boundary.
- 36f761f: Add Schemastery-backed Settings contracts, one-time Host ownership, hook-driven Client scope wiring, secret-safe decoding, and a generated live Settings example.
- 586ff4e: Model DSH support by compatibility generation, distinguish verification confidence, and parameterize the real-runtime smoke scenario.
- 586ff4e: Model DSH support by observable protocol generation, validate plugin peer ranges against the installed DSH version, and generate projects with independent public and local DSH versions.
- e35ff4a: Add experimental component-shaped Conversation contributions over the official Client assembler and keyed chat renderer, plus hook-driven Client API binding so `useApi()` and `useQuery()` no longer require a duplicate `defineClient({ api })` declaration. Keep custom durable Session events explicitly unavailable until DSH exposes an out-of-tree event-vocabulary registry, and update the starter to demonstrate direct Hook usage.
- a300516: Stabilize the Host, Client, API, Settings, Slot, Prompt, and config surfaces as API Candidates, and add the Vite build-extension kernel, standard CSS pipeline, optional Tailwind support, declarations, offline checks, and the Starter/Showcase template matrix.

  This development release intentionally removes the legacy Host `api`, Client `api`/`apis`, `useQuery`, split Conversation Node/Slot, string face config, and old compiler/compatibility entry points. Run `dshx check` and follow the 0.1.1 to 0.1.2 migration guide for exact replacements.
