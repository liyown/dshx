# create-dshx

## 0.1.4-preview.3

### Patch Changes

- b05991b: Make the generated Showcase refresh button issue exactly one Host request per click and render the returned status without a second status query.

## 0.1.4-preview.2

## 0.1.4-preview.1

### Patch Changes

- Install the complete Starter Host runtime dependencies, follow the package manager that invoked the creator, and show continuous progress while dependencies install.

## 0.1.4-preview.0

### Patch Changes

- Add `defineLocale()` as the type-safe plugin-owned localization API. It infers one exact `zh`/`en` key set, registers and disposes dictionaries before Slots, supplies typed translation props, and removes the need for plugin authors to augment `LocaleNamespaceMap`. The starter now demonstrates the complete Locale-to-Slot path and writes the official Locale provider edge automatically.

  Fail `check`, `build`, and every `dev` Client rebuild before runtime when Locale usage is missing either its Cordis service declaration or official provider package edge. Generated project documentation now explains the two Client dependency layers.

  Add a validated `dshx dev --port` option and run the real DSH smoke on an OS-assigned, session-stable loopback port so it can execute beside another live development server.

  Keep packaged Host and Client artifacts relocatable by omitting build-machine absolute project paths from generated runtime metadata and source maps.

  Publish npm-safe DSH provider peer ranges that explicitly include the verified `0.1.1-rc.2` boundary instead of relying on package managers to include a cross-patch prerelease implicitly.

## 0.1.3

## 0.1.2

### Patch Changes

- 856b593: Add typed Prompt Section and dynamic Prompt Context contributions backed by the official DSH System Prompt registry, and include them in newly generated plugin projects.
- 36f761f: Add Schemastery-backed Settings contracts, one-time Host ownership, hook-driven Client scope wiring, secret-safe decoding, and a generated live Settings example.
- 586ff4e: Model DSH support by observable protocol generation, validate plugin peer ranges against the installed DSH version, and generate projects with independent public and local DSH versions.
- e35ff4a: Add experimental component-shaped Conversation contributions over the official Client assembler and keyed chat renderer, plus hook-driven Client API binding so `useApi()` and `useQuery()` no longer require a duplicate `defineClient({ api })` declaration. Keep custom durable Session events explicitly unavailable until DSH exposes an out-of-tree event-vocabulary registry, and update the starter to demonstrate direct Hook usage.
- a300516: Stabilize the Host, Client, API, Settings, Slot, Prompt, and config surfaces as API Candidates, and add the Vite build-extension kernel, standard CSS pipeline, optional Tailwind support, declarations, offline checks, and the Starter/Showcase template matrix.

  This development release intentionally removes the legacy Host `api`, Client `api`/`apis`, `useQuery`, split Conversation Node/Slot, string face config, and old compiler/compatibility entry points. Run `dshx check` and follow the 0.1.1 to 0.1.2 migration guide for exact replacements.
