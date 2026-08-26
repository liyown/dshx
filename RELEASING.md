# Releasing

Changesets owns package versions. `@becomeopc/dshx` and `create-dshx` form a fixed group; `@becomeopc/dshx-hub-cli` is independent. GitHub only opens or updates the version PR. A developer publishes packages locally with npm 2FA after the complete verification suite passes; see the [release runbook](docs/releasing.md).

All public packages stay on `0.1.x` until the project explicitly adopts a new release line. Use patch changesets for every release during this period, including API Candidate breaking changes; the changeset and migration chapter must list them. `pnpm version:check` prevents accidental `0.2.0` or higher bumps.

The website is deployed only from a Cloudflare-authenticated development machine:

```bash
pnpm hub:deploy
```

That command runs all checks including the generic real DSH smoke, applies remote D1 migrations, deploys the Worker and verifies `https://dshx.io`.
