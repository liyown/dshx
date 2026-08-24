# Releasing DSHX packages

GitHub creates Changesets version pull requests, tags, npm releases, provenance attestations, and GitHub Releases. Framework Hub deployment is deliberately excluded: production D1 migrations and Worker deployment remain local through `pnpm hub:deploy`.

## Version policy

- `@becomeopc/dshx` and `create-dshx` are a fixed Changesets group and always release together.
- `@becomeopc/dshx-hub-cli` versions independently.
- Node.js support remains `^22.19.0 || >=24.0.0` until a deliberate compatibility release changes it.

## Trusted Publisher prerequisites

Configure each existing public package on npm with the same GitHub Actions trusted publisher:

| npm package               | Owner    | Repository | Workflow      |
| ------------------------- | -------- | ---------- | ------------- |
| `@becomeopc/dshx`         | `liyown` | `dshx`     | `release.yml` |
| `create-dshx`             | `liyown` | `dshx`     | `release.yml` |
| `@becomeopc/dshx-hub-cli` | `liyown` | `dshx`     | `release.yml` |

Leave the npm environment field empty. The workflow uses GitHub OIDC and npm 11; do not add `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or an npm automation token to GitHub.

Do not merge a Changesets release pull request until all three package settings show the trusted publisher above.

## Hub CLI first publication

`@becomeopc/dshx-hub-cli@0.2.0` must exist on npm before its trusted publisher can be configured. After this infrastructure pull request is merged, start from a clean, current `main` and run:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm deps:check
pnpm audit:prod
pnpm check:all
pnpm smoke:packages
release_dir="$(mktemp -d)"
pnpm --filter @becomeopc/dshx-hub-cli pack --pack-destination "$release_dir"
npm login
npm publish --access public "$release_dir/becomeopc-dshx-hub-cli-0.2.0.tgz"
```

Complete npm 2FA interactively. Immediately bind `@becomeopc/dshx-hub-cli` to `liyown/dshx` and `release.yml`, then remove any temporary local npm session when it is no longer needed. Never commit `.npmrc` credentials.

## Automated release

The serialized `release.yml` workflow runs the complete verification and package smoke gates before invoking Changesets. With pending Changesets it opens or updates the version pull request. After that pull request merges, the same workflow publishes through OIDC, creates tags and GitHub Releases, and requests npm provenance.

Verify each release on npm and GitHub:

- package metadata points to `https://dshx.io` and `liyown/dshx`;
- the tarball contains README, LICENSE, declarations, and its declared binary;
- `dshx`, `create-dshx`, and `dshx-hub` return the published version;
- npm displays provenance linked to `release.yml`;
- the corresponding GitHub Release and tag exist.
