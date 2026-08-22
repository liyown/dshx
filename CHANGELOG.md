# Changelog

## 0.1.1 - 2026-08-22

- Report the installed DSHX package version from `dshx --version`.
- Keep `create-dshx` and `@becomeopc/dshx` template versions aligned.

## 0.1.0 - 2026-08-22

Initial public release of DSHX and create-dshx.

- Build and validate DSH Host and Client plugin faces for the 0.1 protocol generation.
- Add `dshx build`, `check`, `check --fix`, `dev`, `inspect`, and `add` workflows.
- Add runtime Inspect for Slots, Tools, Services, and Events through the Host-owned bridge.
- Add `add ui`, `add tool`, and `add hook` source scaffolds with AST edits, dry-run output, idempotency, and rollback.
- Add deterministic manifest repair with post-fix validation and rollback.
- Verify DSH `0.1.0-rc.8` and `0.1.1-rc.2` against the Phase A fixture, including browser rendering and Client HMR.
