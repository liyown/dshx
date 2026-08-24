# Dependency policy

DSHX adopts maintained ecosystem packages for generic infrastructure and keeps custom code for product-specific DSH contracts.

## Before writing a generic helper

Evaluate existing packages for:

- active maintenance and security history;
- Node.js and ESM compatibility with this repository;
- TypeScript quality, testability, and cross-platform behavior;
- dependency weight, native-binary cost, and supply-chain exposure;
- whether the package preserves DSHX's public behavior and deterministic tests.

Prefer the mature package when it clearly satisfies the requirement. Record the reason when custom code remains.

## Custom code that belongs here

DSH compatibility adapters, compiler/loader boundaries, Profile orchestration, Runtime Inspect, scaffolding transaction semantics, stable diagnostics, and Framework Hub verification/approval protocols encode product contracts. They are not replaced by generic packages merely to reduce line count.

## Automation

- Knip checks unused files, exports, and dependencies with explicit entries for public package exports, bins, generated routes, and fixtures.
- `pnpm audit --prod --audit-level high` blocks critical/high production advisories.
- Renovate groups safe updates, isolates DSH/beta/major upgrades, maintains the lockfile, and updates pinned GitHub Actions digests.
- Every dependency change must pass `pnpm check:all` and the relevant package/real-runtime smoke tests.
