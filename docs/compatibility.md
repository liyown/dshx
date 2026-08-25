# Compatibility and verification

DSHX manages DSH support by observable protocol generation. A generation changes only when an official contract, API seam, loader behavior, or runtime invariant requires different adaptation; a DSH patch or minor release alone does not create an adapter.

## Three independent versions

A plugin repository has three different version axes:

- **DSH version:** the official runtime contract used to load and execute the plugin;
- **plugin version:** the plugin's own product and release lifecycle;
- **DSHX version:** the build-time compiler, diagnostics, and development tooling.

They do not map one-to-one. A plugin declares public DSH support and pins one concrete local test runtime independently:

```json
{
  "peerDependencies": {
    "@deepseek-ai/dsh": ">=0.1.0-rc.8 <0.2.0-0"
  },
  "devDependencies": {
    "@deepseek-ai/dsh": "0.1.1-rc.2",
    "@becomeopc/dshx": "^0.2.0"
  }
}
```

`peerDependencies` is the plugin's public compatibility claim. `devDependencies` selects the concrete DSH used by that repository for build, development, and local verification. The installed package/executable is the runtime source of truth; DSHX semver is independent.

## Protocol-generation source of truth

`packages/dshx/src/compat/protocol-1.ts` is the current generation record. `packages/dshx/src/compat/index.ts` validates the registry, analyzes plugin ranges, selects adapters, reports capabilities, and derives the CI matrix. Each adapter keeps together:

- protocol generation, lifecycle, and non-overlapping DSH semver range;
- the baseline contract version and adapter-owned runtime configuration;
- Profile, manifest, loader, Host contribution, Client, Inspect, connection, and optional runtime-plugin capabilities;
- minimum/latest smoke boundaries and the exact versions actually verified.

The current `protocol-1` adapter covers `>=0.1.0-rc.8 <0.2.0-0`. Its minimum and latest verified boundaries are `0.1.0-rc.8` and `0.1.1-rc.2`. The range reflects current evidence, not an assumption that every DSH minor changes protocol. If DSH `0.2` preserves all relevant contracts, the same adapter may be extended after real smoke; if a seam breaks, a new protocol adapter is required.

One DSHX release may ship multiple adapters. The actual installed DSH version automatically selects one of them.

## One artifact, one generation

The default build produces one Host/Client artifact pair for one protocol generation. A plugin peer range must therefore be fully contained by one adapter range.

`dshx build`, `dev`, and `check` report stable diagnostics when the declaration:

- is missing or invalid;
- extends beyond every range supported by the current DSHX release;
- spans multiple incompatible protocol generations;
- does not contain the DSH version actually installed;
- uses a floating local DSH devDependency instead of one concrete version.

A cross-generation range is not accepted merely because semver intersects each adapter. Multi-target publication requires an explicit artifact strategy from the official DSH ecosystem; DSHX does not fabricate one.

## Status semantics

| Status         | Runtime meaning                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `verified`     | The exact installed DSH version completed the generic real-runtime scenario.                                              |
| `compatible`   | An unverified stable version is inside one known generation range and may run with a warning.                             |
| `experimental` | An unverified prerelease is inside one known generation range and may run with an explicit experimental warning.          |
| `unsupported`  | No adapter owns the installed version. DSHX rejects it by default or uses `allowUnsupported` as a temporary escape hatch. |

Semver membership never implies real-runtime verification. `dshx dev` prints the DSHX version, plugin peer range, installed DSH version, selected adapter/generation, lifecycle, status, and adapter capabilities. `dshx check --json` exposes the same facts for automation.

## Declarative and native compatibility

DSHX may adapt the declarative surface it owns: Host Tools, Commands, Prompt Sections and Contexts, Host Settings ownership, hook-driven Client Settings scopes, Client Slots, typed DSHX APIs, generated manifest fields, Profile operations, and compiler output. The adapter is carried into the compiled artifact while official runtime packages remain external.

Direct `setup(ctx)` logic and native named DSH modules call official APIs without a DSHX wrapper. Their source types come from the installed official packages, and their cross-version behavior remains the plugin author's responsibility. DSHX does not copy official DSH types into parallel versioned type trees. The Settings Hook is a narrow exception to generic source analysis: `check` previews direct Hook calls in the local Client graph, while build/dev make the authoritative decision from retained bundle code after tree-shaking.

## Generic real-runtime scenario

The single `scripts/smoke-dsh.mjs` scenario creates isolated Full, Host-only, Client-only, and native fixtures, installs the selected official DSH package set, and verifies:

- compiler output and artifact installation;
- Profile linking and manifest diagnostics;
- Host and Client loading;
- Tool, Hook, API, Command, Prompt, and Settings contribution registration;
- global and Agent-scoped Prompt assembly, shadowing, dynamic context, Tool schema visibility, and disposal;
- Settings defaults/base/user layering, writes, revision fences, validation recovery, secret redaction, persistence, and restart re-registration;
- API version mismatch and re-registration after Host restart;
- Client HMR;
- runtime Inspect and Bridge behavior.

Select a version through the CLI or environment:

```bash
pnpm smoke:dsh -- --version 0.1.1-rc.2
DSH_VERSION=0.1.1-rc.2 pnpm smoke:dsh
```

Without either value, the registry's latest verified boundary is used. CLI input wins over `DSH_VERSION`. Set `DSHX_KEEP_SMOKE=1` only to preserve a failed temporary fixture for diagnosis.

## CI matrix policy

`getCompatibilitySmokeMatrix()` emits the minimum and latest verified boundary for every generation this DSHX release still resolves. If they are identical it emits one job. A new DSH patch does not add a script or job; update the latest boundary only after the generic scenario passes. A new job pair appears only when an actual contract change introduces an adapter.

Prerelease or `next` probing may run as scheduled experimental coverage when its cost is justified. A known regression version belongs in the matrix only when it protects a concrete invariant.

## Adapter and lifecycle policy

A compatibility change follows this order:

1. compare the official Profile, manifest, Host/Client loader, Tool/Command/Slot, connection, Inspect, restart, reconnect, and HMR seams;
2. run the generic scenario against the candidate DSH version;
3. extend the existing adapter range and verified boundary when the contract is unchanged;
4. add a new adapter only when observable adaptation is required;
5. update the generator peer range only after the target generation is supported and verified.

Adapters move from `active` to `maintenance` before `end-of-life`. An EOL adapter may be removed in a later DSHX release with a changeset, changelog entry, migration note, and removal from the representative matrix. Projects that must remain on that DSH generation pin the last DSHX release that supports it. DSHX does not silently retarget old artifacts to a different generation.

`compatibility.allowUnsupported` downgrades installed-version rejection for temporary diagnosis. It does not turn the version into `compatible` or `verified`, does not validate direct native API calls, and must not be used as evidence for a published compatibility claim.
