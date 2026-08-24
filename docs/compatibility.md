# Compatibility and verification

DSHX compatibility is capability-based. An adapter declares the DSH protocol range it understands and the official seams it can safely use.

## Current generation

DSHX `0.1.x` targets DSH `>=0.1.0-rc.8 <0.2.0`.

- `0.1.0-rc.8` is verified by the Phase A browser fixture.
- `0.1.1-rc.2` is verified by the cold-start matrix.
- Later versions inside the range may run with an explicit unverified-version warning.
- Versions outside every adapter range fail unless `compatibility.allowUnsupported` is explicitly enabled.

## Verification gates

A compatibility claim requires all of the following:

1. the official DSH seam is public and mapped by an adapter;
2. Host and Client artifacts contain no private DSHX runtime dependency;
3. Profile installation uses the official CLI;
4. lifecycle coverage includes dispose, restart, HMR, duplicate registration, and rollback where relevant;
5. the real DSH fixture passes—unit or simulated-loader tests do not substitute for it.

Run the current real matrix with:

```bash
pnpm smoke:rc2
```

Set `DSHX_KEEP_SMOKE=1` only to preserve a failed temporary fixture for diagnosis.
