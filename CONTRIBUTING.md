# Contributing to DSHX

DSHX is a pnpm monorepo for the build-time framework, project creator, Hub website and Hub operations CLI. Keep framework changes runtime-thin: generated artifacts may adapt to DSH, but DSHX must not become a second application runtime.

## Local checks

Use Node `^22.19.0` or `>=24` and pnpm `10.24.0`.

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm deps:check
pnpm audit:prod
pnpm check:all
```

Use maintained ecosystem packages for generic infrastructure when they meet the repository's Node.js, ESM, security, and testability constraints. Keep custom code for DSH-specific product contracts rather than recreating the runtime. Read the [dependency policy](docs/dependency-policy.md) before adding a new helper or package.

Hub-only work can use `pnpm hub:check`. The Cloudflare preview uses a development-only database outside `.output`:

```bash
pnpm --filter @becomeopc/dshx-framework-hub cf:preview
```

Do not add production fixtures, execute third-party plugin lifecycle scripts, or bypass approvals with direct database edits.

## Pull requests and releases

- Add a Changeset for publishable Framework, `create-dshx`, or Hub CLI changes.
- `@becomeopc/dshx` and `create-dshx` release as a fixed version group.
- `@becomeopc/dshx-hub-cli` releases independently.
- Follow the [trusted publishing and first-release runbook](docs/releasing.md); never add npm or Cloudflare production tokens to GitHub.
- Website deployment is manual from a configured development machine; GitHub Actions never deploys Cloudflare resources.

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
