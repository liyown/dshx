# Contributing to DSHX

DSHX is a pnpm monorepo for the build-time framework, project creator, Hub website and Hub operations CLI. Keep framework changes runtime-thin: generated artifacts may adapt to DSH, but DSHX must not become a second application runtime.

## Local checks

Use Node `^22.19.0` or `>=24` and pnpm `10.34.5`.

```bash
pnpm install --frozen-lockfile
pnpm check:ci
```

Pushes and pull requests run one Ubuntu / Node 24 job with formatting, lint, dependency checks, type checks, and package tests. Core is built once to supply the workspace declarations needed by Marketplace checks.

Run `pnpm check:all` locally before a release. The **Full CI** workflow is available through GitHub's manual **Run workflow** action for package archives, real DSH and browser scenarios, both Node versions, and native modules across operating systems.

Use maintained ecosystem packages for generic infrastructure when they meet the repository's Node.js, ESM, security, and testability constraints. Keep custom code for DSH-specific product contracts rather than recreating the runtime. Read the [dependency policy](docs/dependency-policy.md) before adding a new helper or package.

Hub-only work can use `pnpm --filter @becomeopc/dshx build && pnpm hub:check`. The Cloudflare preview uses a development-only database outside `.output`:

```bash
pnpm --filter @becomeopc/dshx-framework-hub cf:preview
```

Do not add production fixtures, execute third-party plugin lifecycle scripts, or bypass approvals with direct database edits.

## Pull requests and releases

- Add a Changeset for publishable Framework, `create-dshx`, or Hub CLI changes.
- `@becomeopc/dshx` and `create-dshx` release as a fixed version group.
- `@becomeopc/dshx-hub-cli` releases independently.
- Follow the [local package publication runbook](docs/releasing.md); never add npm or Cloudflare production tokens to GitHub.
- Website deployment is manual from a configured development machine; GitHub Actions never deploys Cloudflare resources.

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
