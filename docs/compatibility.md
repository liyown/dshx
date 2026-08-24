# Compatibility and verification

DSHX compatibility is capability-based and organized by DSH contract generation. A generation adapter owns one non-overlapping semver range and the official Profile, manifest, loader, Client, Inspect, and connection seams that DSHX can safely use. New DSH releases reuse that adapter until an actual contract or runtime behavior change requires another one.

## Source of truth

`packages/dshx/src/compat/dsh-0.1.ts` is the current generation record, and `packages/dshx/src/compat/index.ts` is the adapter registry and resolver. Each adapter keeps together:

- the generation id and supported semver range;
- the adapter implementation and official runtime capabilities;
- the minimum and latest versions selected for real-runtime verification;
- the exact versions that have completed that verification.

The resolver, diagnostics, default local smoke version, and CI matrix all consume this registry. Documentation describes the model and current range rather than duplicating an ever-growing list of patch releases.

The current DSH `0.1` generation covers `>=0.1.0-rc.8 <0.2.0-0`. The `-0` upper bound deliberately excludes prereleases of the next `0.2` generation. Its registry currently selects `0.1.0-rc.8` as the minimum boundary and `0.1.1-rc.2` as the latest verified boundary.

## Status semantics

| Status         | Runtime behavior                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `verified`     | The exact installed version completed the generic real-runtime scenario.                                               |
| `compatible`   | An unverified stable version is inside a known generation range and may run with a warning.                            |
| `experimental` | An unverified prerelease is inside a known generation range and may run with an explicit experimental warning.         |
| `unsupported`  | No adapter owns the version. DSHX rejects it by default or uses the existing `allowUnsupported` override with warning. |

Semver membership therefore never implies real-runtime verification. A declared dependency range selects an adapter with `compatible` confidence; only an exact version present in the verified set receives `verified` status.

## Generic real-runtime scenario

The one scenario in `scripts/smoke-dsh.mjs` creates isolated Full, Host-only, Client-only, and native fixtures, installs the selected official DSH package set, and retains the existing checks for:

- compiler output and artifact installation;
- Profile linking and manifest diagnostics;
- Host and Client loading;
- Tool, Hook, API, and Command registration;
- API version mismatch and re-registration after Host restart;
- Client HMR;
- runtime Inspect and Bridge behavior.

Select a version through the CLI or environment:

```bash
pnpm smoke:dsh -- --version 0.1.1-rc.2
DSH_VERSION=0.1.1-rc.2 pnpm smoke:dsh
```

Without either value, the adapter registry's latest verified boundary is used. CLI input wins over `DSH_VERSION`. Set `DSHX_KEEP_SMOKE=1` only to preserve a failed temporary fixture for diagnosis.

## CI matrix policy

`getCompatibilitySmokeMatrix()` emits the minimum and latest verified boundary for every registered generation. CI builds the compatibility package, serializes that result, and runs the same generic scenario for each entry. If both boundaries are identical, it emits one entry. A new DSH patch does not add a job; update a boundary only after the scenario passes. A new job pair appears only when a real contract change introduces a generation adapter.

Prerelease or `next` probing may be added as a scheduled, explicitly experimental entry when its cost is justified. Known regression versions belong only when they protect a concrete invariant.

## Verification gate

A compatibility claim requires all of the following:

1. the official DSH seam is public and mapped by an adapter;
2. Host and Client artifacts contain no private DSHX runtime dependency;
3. Profile installation uses the official CLI;
4. lifecycle coverage includes dispose, restart, reconnect, HMR, duplicate registration, and rollback where relevant;
5. the real DSH fixture passes—unit or simulated-loader tests do not substitute for it.
