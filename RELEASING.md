# Releasing

The first usable DSHX line is published as a Changesets prerelease through the npm `preview` tag. Planned first versions are `@becomeopc/dshx` and `create-dshx` `0.1.4-preview.0`, `@becomeopc/dshx-hub-cli` `0.1.2-preview.0`, and `@becomeopc/dshx-plugin-marketplace` `0.1.0-preview.0`. The existing npm `latest` channel remains unchanged.

Do not version or publish directly from this summary. Follow the complete [Preview release runbook](docs/releasing.md): finalize changesets, enter Changesets pre mode, run the full package/Hub/real-DSH gates, inspect `publish-plan`, publish locally with npm 2FA, promote the exact marketplace catalog target, and then run the required published-Hub smoke.

`pnpm release` and `pnpm release:preview` share the same clean-main/pre-state/publish-plan gate. GitHub only creates a Preview version PR after `.changeset/pre.json` explicitly selects the `preview` tag; it has no npm credentials and creates no GitHub Release. Framework Hub deployment is a separate authenticated operation.
