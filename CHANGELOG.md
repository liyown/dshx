# Changelog

## Unreleased

- Replace the version-named DSH smoke with one parameterized real-runtime scenario and a generation-derived CI boundary matrix.
- Distinguish exact `verified`, stable `compatible`, prerelease `experimental`, and `unsupported` DSH status without treating semver membership as real-runtime verification.
- Add core/create/scripts lint and format gates, and keep npm publication local while GitHub only maintains the Changesets version PR.
- Harden typed unary APIs across compiled artifacts, cancellation, version mismatch, Host disposal/restart, and reconnect-aware queries.
- Add official Command contributions through `defineCommand`, `defineHost({ commands })`, and the transactional `dshx add command` scaffold.
- Extend the real DSH `0.1.1-rc.2` smoke matrix with Host API calls, official Command registry/parser execution, and version/restart checks.

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
